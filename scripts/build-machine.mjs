// 演習用の機械（本物の Linux を WASM のエミュレータ v86 で動かす）の配布物を .machine/ に作る。
// Alpine Linux の最小構成・sudo・git・ssh-keygen・カーネルと BIOS を、版とハッシュを固定して取得し（scripts/machine-sources.mjs）、起動を済ませた状態を保存する。
// 取得するのはビルドのときだけで、配布物は実行時に外へ取りに行かない（spec §12）。
// --sources を付けると、取得物を用意して、その場所を 1 行ずつ出す（保管場所へ置くときに使う。docs/machine-sources.md）
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gunzipSync, zstdCompressSync } from 'node:zlib';
import { V86 } from 'v86';
import { cpioArchive, readTar } from './cpio.mjs';
import { SOURCES, fetchSource } from './machine-sources.mjs';

/** 配布物を置く場所。ビルド（scripts/build.mjs）とテスト（tests/support/machine-assets.ts）がここから読む */
export const MACHINE_DIR = '.machine';
/** 配布物のファイル名。runtimes/browser/machine.ts の MACHINE_ASSETS と同じ */
export const MACHINE_FILES = ['v86.wasm', 'seabios.bin', 'vgabios.bin', 'linux.state.zst'];

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
 * git のパッケージから機械に置くもの。git 本体（log・show・commit などは、すべてこの 1 つに入っている）だけを置く。
 * HTTP で通信する部品（git-remote-http など。libcurl が要る）と、接続を受ける部品（git-shell など）は置かない。機械は外と通信しない
 */
const GIT_FILES = new Set(['usr', 'usr/bin', 'usr/bin/git']);

/** 取得したものを残しておく場所。次からは取りに行かない */
const CACHE_DIR = join(MACHINE_DIR, 'cache');

/**
 * 取得したもの（名前は SOURCES のキー）
 * @typedef {Record<keyof typeof SOURCES, Buffer>} Sources
 */
/** @typedef {import('./cpio.mjs').Entry} Entry */

/** @type {(data: string | Buffer) => string} */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
/** @type {(bytes: Buffer) => { buffer: ArrayBuffer }} */
const image = (bytes) => ({ buffer: /** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) });

/** @returns {Promise<Sources>} */
async function fetchSources() {
  const names = /** @type {(keyof typeof SOURCES)[]} */ (Object.keys(SOURCES));
  const fetched = await Promise.all(names.map((name) => fetchSource(SOURCES[name], { cacheDir: CACHE_DIR })));
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
  const packages = [sources.zlib, sources.sudo, sources.pcre2, sources.sshKeygen].flatMap((apk) => readTar(gunzipSync(apk)).filter((entry) => !APK_METADATA.test(entry.path)));
  const git = readTar(gunzipSync(sources.git)).filter((entry) => GIT_FILES.has(entry.path));
  // 層の重ね合わせ（overlayfs）は、カーネルのモジュールとして入っている。起動のときに読み込めるよう、展開して置く
  /** @type {Entry} */
  const overlay = { path: `${GUEST_LIB}/overlay.ko`, type: 'file', mode: 0o644, data: gunzipSync(kernelFile(kernelEntries, OVERLAY_MODULE)) };
  return cpioArchive([...readTar(gunzipSync(sources.rootfs)), ...packages, ...git, ...(await guestEntries()), overlay]);
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
  const scripts = ['build-machine.mjs', 'cpio.mjs', 'machine-sources.mjs'].map((name) => fileURLToPath(new URL(name, import.meta.url)));
  const files = [...scripts, V86_WASM, ...guests];
  return sha256((await Promise.all(files.map(async (file) => sha256(await readFile(file))))).join('\n'));
}

/** 配布物がなければ（または元になるものが変わっていれば）作る。作り直さなかったら false を返す */
export async function ensureMachine() {
  const stamp = join(MACHINE_DIR, 'inputs.sha256');
  const wanted = await inputsHash();
  const current = MACHINE_FILES.every((file) => existsSync(join(MACHINE_DIR, file))) && existsSync(stamp) && (await readFile(stamp, 'utf8')) === wanted;
  if (current) return false;

  await mkdir(MACHINE_DIR, { recursive: true });
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
  if (process.argv.includes('--sources')) {
    await fetchSources();
    for (const source of Object.values(SOURCES)) console.log(join(CACHE_DIR, source.file));
    process.exit(0);
  }
  const built = await ensureMachine();
  console.log(built ? `演習用の機械を作りました: ${MACHINE_DIR}/` : `演習用の機械は最新です: ${MACHINE_DIR}/`);
  // エミュレータのタイマーが残っていても終える
  process.exit(0);
}
