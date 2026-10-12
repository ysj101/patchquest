// ビルド成果物が外部のURLを読み込んでいないかを検査する（spec §12）。
// 読み込み方法を列挙せず、出荷するファイル中の外部URLをすべて違反とし、
// 読み込みに使われないと確認したURLだけを ALLOWED_PREFIXES で許可する。
// 実行時の通信の有無はE2Eテストで実測する。
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './scan.mjs';

const ALLOWED_PREFIXES = [
  // XML名前空間の識別子。通信は発生しない
  'http://www.w3.org/',
  // SQLite WASM の警告文に含まれる説明ページ（同梱コードは読み込みに使わない）
  'https://sqlite.org/wasm/doc/',
];

const ABSOLUTE_URL = /\bhttps?:\/\/[^\s"'`<>()\\]+/gi;
// プロトコル相対URL（//host/...）はHTML属性とCSSのurl()・@importで外部読み込みになる
const PROTOCOL_RELATIVE = /(?:=\s*["']?|url\(\s*["']?|@import\s+["'])\s*(\/\/[^\s"'`<>()\\]+)/gi;

const SCANNED = new Set(['.html', '.css', '.js']);

/**
 * @param {{ path: string, content: string }[]} files
 * @returns {{ path: string, match: string }[]}
 */
export function findExternalRefs(files) {
  const violations = [];
  for (const { path, content } of files) {
    const ext = extname(path);
    if (!SCANNED.has(ext)) continue;
    const urls = [...content.matchAll(ABSOLUTE_URL)].map((m) => m[0]);
    if (ext !== '.js') urls.push(...[...content.matchAll(PROTOCOL_RELATIVE)].map((m) => m[1]));
    for (const url of urls) {
      if (!ALLOWED_PREFIXES.some((p) => url.startsWith(p))) violations.push({ path, match: url });
    }
  }
  return violations;
}

/** 違反を表示し、1件でもあればプロセスを失敗終了させる */
export async function assertNoExternalRefs(dir) {
  const paths = await listFiles(dir, [...SCANNED]);
  const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(path, 'utf8') })));
  const violations = findExternalRefs(files);
  for (const v of violations) console.error(`外部参照: ${v.path}: ${v.match}`);
  if (violations.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist';
  await assertNoExternalRefs(dir);
  console.log(`外部参照なし: ${dir}`);
}
