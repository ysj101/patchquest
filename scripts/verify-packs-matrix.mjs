// 出荷前検証のテスト（パックごとに 1 件）の題名を、CI のジョブの matrix（JSON）として標準出力に出す。パックを足しても ci.yml を直さずに済む
import { execFileSync } from 'node:child_process';

// 一覧の各行は「[project] › ファイル:行:列 › 題名」。--list はテストを実行しない
const output = execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--list', '--project', 'chrome-verify'], { encoding: 'utf8' });
const titles = output
  .split('\n')
  .filter((line) => line.trim().startsWith('[chrome-verify]'))
  .map((line) => line.split(' › ').slice(2).join(' › '));
if (titles.length === 0) throw new Error('出荷前検証のテストが 1 件もありません');
// --grep に渡す正規表現。題名の記号をそのまま照合させる
/** @param {string} text */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log(JSON.stringify({ include: titles.map((title) => ({ title, grep: `${escape(title)}$` })) }));
