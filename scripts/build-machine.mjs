// 演習用の機械（本物の Linux を WASM のエミュレータ v86 で動かす）の配布物を .machine/ に作る。
// Alpine Linux の最小構成・sudo・カーネルと BIOS を、版とハッシュを固定して取得し、起動を済ませた状態を保存する。
// 取得するのはビルドのときだけで、配布物は実行時に外へ取りに行かない（spec §12）
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gunzipSync, zstdCompressSync } from 'node:zlib';
import { V86 } from 'v86';
import { cpioArchive, readTar } from './cpio.mjs';

/** 配布物を置く場所。ビルド（scripts/build.mjs）とテスト（tests/support/machine-assets.ts）がここから読む */
export const MACHINE_DIR = '.machine';
/** 配布物のファイル名。runtimes/browser/machine.ts の MACHINE_ASSETS と同じ */
export const MACHINE_FILES = ['v86.wasm', 'seabios.bin', 'vgabios.bin', 'linux.state.zst'];

const ALPINE = 'https://dl-cdn.alpinelinux.org/alpine/v3.24';
/** v86 の npm パッケージ（0.5.473）と同じコミットの BIOS */
const V86_REPO = 'https://raw.githubusercontent.com/copy/v86/315b2b0b758703ef0e6cc7b4088d6068f83f3c20';
/** 取得するもの。中身が変わっていたら（ハッシュが合わなければ）止める */
const SOURCES = {
  rootfs: { url: `${ALPINE}/releases/x86/alpine-minirootfs-3.24.4-x86.tar.gz`, sha256: 'df793865bf166c10acaad3a4d5d40498f9ee3f89fa405d39c7f540464fb3b0c1' },
  zlib: { url: `${ALPINE}/main/x86/zlib-1.4-r0.apk`, sha256: '909b895b67a2de227c694764f697a8679570a603560100d050c3193154150396' },
  sudo: { url: `${ALPINE}/community/x86/sudo-1.9.17_p2-r2.apk`, sha256: '19f34845b079844e8e1b0630e9748a197c1a4d350e87840bc9ebd02b32c257e1' },
  kernel: { url: `${ALPINE}/main/x86/linux-virt-6.18.64-r0.apk`, sha256: '738a314414f3a9e7e7dd6f23dd480e86a35bb8d3a373c36ef29d2c110fcce5a3' },
  seabios: { url: `${V86_REPO}/bios/seabios.bin`, sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98' },
  vgabios: { url: `${V86_REPO}/bios/vgabios.bin`, sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880' },
};

const GUEST_DIR = 'apps/shell/linux/guest';
const V86_WASM = 'node_modules/v86/build/v86.wasm';
/** 機械のメモリ。runtimes/browser/machine.ts の MEMORY_BYTES と同じ値にする */
const MEMORY_BYTES = 96 * 1024 * 1024;
const KERNEL_PATH = 'boot/vmlinuz-virt';
const OVERLAY_MODULE = 'lib/modules/6.18.64-0-virt/kernel/fs/overlayfs/overlay.ko.gz';
/** 機械の中で、係のスクリプトを置く場所 */
const GUEST_LIB = 'usr/lib/pq';
/** 解放したメモリを 0 で埋めさせ、保存した状態を小さく圧縮できるようにする */
const CMDLINE = 'console=ttyS0 rdinit=/init quiet panic=-1 tsc=reliable mitigations=off init_on_free=1';
/** 機械の中の係（agent）が、要求を待ち始めたときに出す行 */
const READY = '\u0002PQ ready\n';
const BOOT_TIMEOUT_MS = 120_000;
/** apk に入っている、パッケージ管理用のファイル。機械には置かない */
const APK_METADATA = /^\.(?:PKGINFO|SIGN\.|pre-|post-|trigger)/;

/**
 * 取得したもの（名前は SOURCES のキー）
 * @typedef {Record<keyof typeof SOURCES, Buffer>} Sources
 */
/** @typedef {import('./cpio.mjs').Entry} Entry */

/** @type {(data: string | Buffer) => string} */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
/** @type {(bytes: Buffer) => { buffer: ArrayBuffer }} */
const image = (bytes) => ({ buffer: /** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) });

/**
 * 取得したものを .machine/cache に置き、次からは取りに行かない。ハッシュが合わなければ止める
 * @param {string} name
 * @param {{ url: string, sha256: string }} source
 * @returns {Promise<Buffer>}
 */
async function fetchSource(name, { url, sha256: expected }) {
  const cached = join(MACHINE_DIR, 'cache', `${name}-${expected.slice(0, 12)}`);
  if (existsSync(cached)) {
    const data = await readFile(cached);
    if (sha256(data) === expected) return data;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を取得できません（${response.status}）`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== expected) throw new Error(`${url} の中身が、固定したハッシュと合いません`);
  await writeFile(cached, data);
  return data;
}

/** @returns {Promise<Sources>} */
async function fetchSources() {
  const names = /** @type {(keyof typeof SOURCES)[]} */ (Object.keys(SOURCES));
  const fetched = await Promise.all(names.map((name) => fetchSource(name, SOURCES[name])));
  return /** @type {Sources} */ (Object.fromEntries(names.map((name, index) => [name, fetched[index]])));
}

/**
 * 機械の中で動かすスクリプト（apps/shell/linux/guest）。init は /、ほかは /usr/lib/pq に置く
 * @returns {Promise<Entry[]>}
 */
async function guestEntries() {
  const names = (await readdir(GUEST_DIR)).sort();
  /** @type {Entry[]} */
  const entries = [{ path: GUEST_LIB, type: 'dir', mode: 0o755 }];
  for (const name of names) entries.push({ path: name === 'init' ? 'init' : `${GUEST_LIB}/${name}`, type: 'file', mode: 0o755, data: await readFile(join(GUEST_DIR, name)) });
  return entries;
}

/**
 * カーネルのパッケージから、ファイルを 1 つ取り出す
 * @param {Entry[]} entries
 * @param {string} path
 * @returns {Buffer}
 */
function kernelFile(entries, path) {
  const file = entries.find((entry) => entry.path === path);
  if (!file?.data) throw new Error(`カーネルのパッケージに ${path} がありません`);
  return file.data;
}

/**
 * 起動時にメモリへ展開されるファイルシステム（initramfs）を組み立てる
 * @param {Sources} sources
 * @param {Entry[]} kernelEntries
 * @returns {Promise<Buffer>}
 */
async function buildInitrd(sources, kernelEntries) {
  const packages = [sources.zlib, sources.sudo].flatMap((apk) => readTar(gunzipSync(apk)).filter((entry) => !APK_METADATA.test(entry.path)));
  // 層の重ね合わせ（overlayfs）は、カーネルのモジュールとして入っている。起動のときに読み込めるよう、展開して置く
  /** @type {Entry} */
  const overlay = { path: `${GUEST_LIB}/overlay.ko`, type: 'file', mode: 0o644, data: gunzipSync(kernelFile(kernelEntries, OVERLAY_MODULE)) };
  return cpioArchive([...readTar(gunzipSync(sources.rootfs)), ...packages, ...(await guestEntries()), overlay]);
}

/**
 * 機械を起動し、係が要求を待ち始めたところで状態を保存する。実行時はここから始めるので、起動を待たずに済む
 * @param {Sources} sources
 * @param {Buffer} kernel
 * @param {Buffer} initrd
 * @returns {Promise<Buffer>}
 */
async function bootAndSave(sources, kernel, initrd) {
  const emulator = new V86({
    wasm_path: V86_WASM,
    bios: image(sources.seabios),
    vga_bios: image(sources.vgabios),
    bzimage: image(kernel),
    initrd: image(initrd),
    cmdline: CMDLINE,
    memory_size: MEMORY_BYTES,
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`機械が ${BOOT_TIMEOUT_MS / 1000} 秒以内に起動しませんでした：\n${output.slice(-2000)}`));
    }, BOOT_TIMEOUT_MS);
    emulator.add_listener('serial0-output-byte', (byte) => {
      output += String.fromCharCode(byte);
      if (!output.endsWith(READY)) return;
      clearTimeout(timer);
      resolve(undefined);
    });
  });
  const state = Buffer.from(await emulator.save_state());
  await emulator.destroy();
  return zstdCompressSync(state, { params: { [constants.ZSTD_c_compressionLevel]: 19 } });
}

/** 配布物の中身を決めるもの（このスクリプト・cpio の組み立て・機械の中のスクリプト・エミュレータ）のハッシュ */
async function inputsHash() {
  const guests = (await readdir(GUEST_DIR)).sort().map((name) => join(GUEST_DIR, name));
  const files = [fileURLToPath(import.meta.url), fileURLToPath(new URL('cpio.mjs', import.meta.url)), V86_WASM, ...guests];
  return sha256((await Promise.all(files.map(async (file) => sha256(await readFile(file))))).join('\n'));
}

/** 配布物がなければ（または元になるものが変わっていれば）作る。作り直さなかったら false を返す */
export async function ensureMachine() {
  const stamp = join(MACHINE_DIR, 'inputs.sha256');
  const wanted = await inputsHash();
  const current = MACHINE_FILES.every((file) => existsSync(join(MACHINE_DIR, file))) && existsSync(stamp) && (await readFile(stamp, 'utf8')) === wanted;
  if (current) return false;

  await mkdir(join(MACHINE_DIR, 'cache'), { recursive: true });
  const sources = await fetchSources();
  const kernelEntries = readTar(gunzipSync(sources.kernel));
  const state = await bootAndSave(sources, kernelFile(kernelEntries, KERNEL_PATH), await buildInitrd(sources, kernelEntries));
  await Promise.all([
    writeFile(join(MACHINE_DIR, 'linux.state.zst'), state),
    writeFile(join(MACHINE_DIR, 'seabios.bin'), sources.seabios),
    writeFile(join(MACHINE_DIR, 'vgabios.bin'), sources.vgabios),
    copyFile(V86_WASM, join(MACHINE_DIR, 'v86.wasm')),
  ]);
  await writeFile(stamp, wanted);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = await ensureMachine();
  console.log(built ? `演習用の機械を作りました: ${MACHINE_DIR}/` : `演習用の機械は最新です: ${MACHINE_DIR}/`);
  // エミュレータのタイマーが残っていても終える
  process.exit(0);
}
