// 学習UI（Host）が教材データ・コメント・ログを HTML として挿入しないよう、危険な API の使用を禁じる（spec §6, §14）。
// 隔離 iframe 内の画面（runtimes/browser/preview/）と教材アプリは対象外（脆弱性の注入先になるため）
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['platform', 'runtimes/browser'];
const EXCLUDED = ['runtimes/browser/preview'];
const FORBIDDEN = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/];

export async function findUnsafeDom() {
  const violations = [];
  for (const root of ROOTS) {
    const entries = await readdir(root, { withFileTypes: true, recursive: true });
    for (const e of entries) {
      const path = join(e.parentPath, e.name);
      if (!e.isFile() || !path.endsWith('.ts') || EXCLUDED.some((x) => path.startsWith(x))) continue;
      const lines = (await readFile(path, 'utf8')).split('\n');
      lines.forEach((line, i) => FORBIDDEN.some((re) => re.test(line)) && violations.push(`${path}:${i + 1}: ${line.trim()}`));
    }
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await findUnsafeDom();
  for (const v of violations) console.error(`HTML として挿入する API は使えません: ${v}`);
  if (violations.length > 0) process.exit(1);
  console.log('学習UIに危険な DOM 操作はありません');
}
