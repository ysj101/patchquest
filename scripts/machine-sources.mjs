// 演習用の機械の元になる取得物（Alpine Linux の最小構成・パッケージ・BIOS）の一覧と、その取得。
// 版とハッシュを固定し、このリポジトリのリリースに保管したものから取得する。配布元（Alpine・v86）は、
// 保管場所にまだ置いていないとき（版を上げる作業の途中）だけ使う。手順は docs/machine-sources.md
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 保管場所（このリポジトリのリリース）。取得物の版を上げたら、新しいリリースを作って番号を上げる */
export const MIRROR = 'https://github.com/ysj101/patchquest/releases/download/machine-sources-1';
const ALPINE = 'https://dl-cdn.alpinelinux.org/alpine/v3.24';
/** v86 の npm パッケージ（0.5.473）と同じコミットの BIOS */
const V86_REPO = 'https://raw.githubusercontent.com/copy/v86/315b2b0b758703ef0e6cc7b4088d6068f83f3c20';

/**
 * 取得するもの 1 つ。file は保管場所とキャッシュでの名前、upstream は配布元の URL
 * @typedef {{ file: string, upstream: string, sha256: string }} Source
 */

/** 取得するもの。中身が変わっていたら（ハッシュが合わなければ）使わない */
export const SOURCES = {
  rootfs: { file: 'alpine-minirootfs-3.24.4-x86.tar.gz', upstream: `${ALPINE}/releases/x86/alpine-minirootfs-3.24.4-x86.tar.gz`, sha256: 'df793865bf166c10acaad3a4d5d40498f9ee3f89fa405d39c7f540464fb3b0c1' },
  zlib: { file: 'zlib-1.4-r0.apk', upstream: `${ALPINE}/main/x86/zlib-1.4-r0.apk`, sha256: '909b895b67a2de227c694764f697a8679570a603560100d050c3193154150396' },
  sudo: { file: 'sudo-1.9.17_p2-r2.apk', upstream: `${ALPINE}/community/x86/sudo-1.9.17_p2-r2.apk`, sha256: '19f34845b079844e8e1b0630e9748a197c1a4d350e87840bc9ebd02b32c257e1' },
  kernel: { file: 'linux-virt-6.18.64-r0.apk', upstream: `${ALPINE}/main/x86/linux-virt-6.18.64-r0.apk`, sha256: '738a314414f3a9e7e7dd6f23dd480e86a35bb8d3a373c36ef29d2c110fcce5a3' },
  seabios: { file: 'seabios.bin', upstream: `${V86_REPO}/bios/seabios.bin`, sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98' },
  vgabios: { file: 'vgabios.bin', upstream: `${V86_REPO}/bios/vgabios.bin`, sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880' },
};

/** @type {(data: Buffer) => string} */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * URL から取得し、固定したハッシュと合うことを確かめる。取得できない・合わないときは、理由を付けて失敗する
 * @param {typeof fetch} fetcher
 * @param {string} url
 * @param {string} expected
 * @returns {Promise<Buffer>}
 */
async function download(fetcher, url, expected) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url} を取得できません（${response.status}）`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== expected) throw new Error(`${url} の中身が、固定したハッシュと合いません`);
  return data;
}

/** @type {(error: unknown) => string} */
const reason = (error) => (error instanceof Error ? error.message : String(error));

/**
 * 保管場所から取得する。保管場所から得られないときだけ、配布元から取得して warn で知らせる
 * @param {Source} source
 * @param {typeof fetch} fetcher
 * @param {(message: string) => void} warn
 * @returns {Promise<Buffer>}
 */
async function fromMirrorOrUpstream(source, fetcher, warn) {
  try {
    return await download(fetcher, `${MIRROR}/${source.file}`, source.sha256);
  } catch (mirrorError) {
    try {
      const data = await download(fetcher, source.upstream, source.sha256);
      warn(`${source.file} は保管場所にないので、配布元から取得しました（${reason(mirrorError)}）。保管場所に置いてください（docs/machine-sources.md）`);
      return data;
    } catch (upstreamError) {
      throw new Error(`${source.file} を、保管場所からも配布元からも取得できません：\n- ${reason(mirrorError)}\n- ${reason(upstreamError)}`, { cause: upstreamError });
    }
  }
}

/**
 * 取得物を 1 つ用意する。キャッシュにあればそれを使い、なければ保管場所から、保管場所にもなければ配布元から取得する。
 * どこから得たものも、ハッシュが合わなければ使わない。配布元から取得したときは、保管場所に置くよう warn で知らせる
 * @param {Source} source
 * @param {{ cacheDir: string, fetcher?: typeof fetch, warn?: (message: string) => void }} options
 * @returns {Promise<Buffer>}
 */
export async function fetchSource(source, { cacheDir, fetcher = fetch, warn = console.warn }) {
  const cached = join(cacheDir, source.file);
  const kept = await readFile(cached).catch(() => null);
  if (kept && sha256(kept) === source.sha256) return kept;

  const data = await fromMirrorOrUpstream(source, fetcher, warn);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, data);
  return data;
}
