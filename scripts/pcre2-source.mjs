// 同梱する正規表現エンジン PCRE2（WASM）の、元になるソース・置き場所・配布物に添える表示。
// 作り方は scripts/build-pcre2.mjs、版を上げる手順は docs/pcre2-wasm.md
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 取得するソース。PCRE2 の公式のリリース（GitHub の PCRE2Project/pcre2）。中身が変わっていたら（ハッシュが合わなければ）使わない */
export const PCRE2_SOURCE = {
  version: '10.49',
  file: 'pcre2-10.49.tar.gz',
  url: 'https://github.com/PCRE2Project/pcre2/releases/download/pcre2-10.49/pcre2-10.49.tar.gz',
  sha256: '929f0b20e62879252a15886b06c89f1edef61a363cbd5826fb041080a5e557ae',
};

/** 出来上がりを置く場所。ビルド（scripts/build.mjs）とテスト（tests/support/machine-assets.ts）がここから読む */
export const PCRE2_DIR = 'vendor/pcre2';
/** 配布物の名前。runtimes/browser/regex.ts の REGEX_ASSET と同じ */
export const PCRE2_WASM = 'pcre2.wasm';
/** PCRE2 のソースに入っているライセンス文（LICENCE.md）の写し */
export const PCRE2_LICENCE = 'LICENCE.md';
/**
 * リポジトリに入れてある pcre2.wasm のハッシュ。作り直したら（scripts/build-pcre2.mjs が出す値に）合わせて書き換える。
 * tests/unit/pcre2-source.test.ts が、置いてあるファイルと合うことを確かめる（断りなく差し替わったら止まる）
 */
export const PCRE2_WASM_SHA256 = '18dd1860037ffa03a7aba0e15796a72664043492c0fd0e7ed5b81e8b59a5678c';

/**
 * 配布物に添える表示（版・ライセンス・ソースコードの入手先・ライセンスの全文）
 * @returns {Promise<string>}
 */
export async function pcre2LegalText() {
  const licence = await readFile(join(PCRE2_DIR, PCRE2_LICENCE), 'utf8');
  return [
    `assets/${PCRE2_WASM} は、正規表現エンジン PCRE2 ${PCRE2_SOURCE.version} を WebAssembly にビルドしたものです。`,
    '8 ビットのライブラリだけを含みます（Unicode の表と JIT は含みません）。',
    '',
    'ライセンス：BSD-3-Clause WITH PCRE2-exception',
    `ソースコード：${PCRE2_SOURCE.url}`,
    `  SHA-256 ${PCRE2_SOURCE.sha256}`,
    'ビルドの手順と、PatchQuest が足した入口（C のソース）：PatchQuest のリポジトリの scripts/build-pcre2.mjs・scripts/pcre2/',
    '',
    '以下は、PCRE2 のソースコードに入っているライセンス文（LICENCE.md）の全文です。',
    '',
    '----------------------------------------------------------------------',
    '',
    licence,
  ].join('\n');
}
