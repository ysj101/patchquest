// ビルド成果物が外部のURLを読み込んでいないかを検査する（spec §12）。
// 実行時の通信の有無はE2Eテストで実測する。ここでは明らかな記述ミスを機械的に止める。
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTERNAL = String.raw`(?:https?:)?//`;

const RULES = {
  '.html': [
    new RegExp(String.raw`\b(?:src|href|action|srcset|poster|data|formaction)\s*=\s*["']?\s*${EXTERNAL}`, 'gi'),
    new RegExp(String.raw`url\(\s*["']?\s*${EXTERNAL}`, 'gi'),
    new RegExp(String.raw`@import\s+["']\s*${EXTERNAL}`, 'gi'),
  ],
  '.css': [
    new RegExp(String.raw`url\(\s*["']?\s*${EXTERNAL}`, 'gi'),
    new RegExp(String.raw`@import\s+["']\s*${EXTERNAL}`, 'gi'),
  ],
  '.js': [
    new RegExp(
      String.raw`(?:\bimport\s*\(|\bfrom\s*|\bimportScripts\s*\(|\bfetch\s*\(|\bnew\s+(?:Worker|SharedWorker|WebSocket|EventSource)\s*\(|\bsendBeacon\s*\()\s*["'\x60]${EXTERNAL}`,
      'g',
    ),
  ],
};

/**
 * @param {{ path: string, content: string }[]} files
 * @returns {{ path: string, match: string }[]}
 */
export function findExternalRefs(files) {
  const violations = [];
  for (const { path, content } of files) {
    for (const rule of RULES[extname(path)] ?? []) {
      for (const m of content.matchAll(rule)) {
        violations.push({ path, match: m[0] });
      }
    }
  }
  return violations;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

export async function checkDirectory(dir) {
  const paths = (await listFiles(dir)).filter((p) => extname(p) in RULES);
  const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(path, 'utf8') })));
  return findExternalRefs(files);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist';
  const violations = await checkDirectory(dir);
  for (const v of violations) console.error(`外部参照: ${v.path}: ${v.match}`);
  if (violations.length > 0) process.exit(1);
  console.log(`外部参照なし: ${dir}`);
}
