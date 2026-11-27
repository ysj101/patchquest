// pre-commit 用：stage したファイルに関係するユニットテストだけを走らせる。import をたどれない変更のときは、全件を走らせる。
// 全体は `pnpm run check` と CI で確かめる。使い方：git diff --cached --name-only --no-renames -z | node scripts/test-related.mjs
// （削除したファイルも受け取る。削除したものは vitest に渡さず、テストが読むファイルかどうかの判断にだけ使う）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * import をたどっても、テストへの影響を拾えないもの。変わったら全件を走らせる。迷うものはここに入れる。
 * - 設定・依存・型の設定：テスト全体の前提を変える
 * - tests/support/：テストが共有する部品。globalSetup（機械の配布物）もここ
 * - 機械の配布物を決めるもの：.github/workflows/ci.yml の .machine のキャッシュの鍵と同じ範囲
 * - scripts/machine-licenses/：同梱ソフトウェアの一覧が readFile で読むライセンス文
 */
export const FULL_RUN_PATTERNS = [
  /^vitest\.config\.ts$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig[^/]*\.json$/,
  /^tests\/support\//,
  /^scripts\/(build-machine|cpio|machine-sources)\.mjs$/,
  /^apps\/shell\/linux\/guest\//,
  /^scripts\/machine-licenses\//,
];

/** import されていないが、テストが読むファイル。変わったら、そのテストも走らせる */
export const READ_BY_TESTS = [
  // 操作ガイドの案内先が、学習UIの全ファイルに書かれているか読んで調べる
  { pattern: /^platform\/ui\/[^/]+\.ts$/, tests: ['tests/unit/catalog.test.ts'] },
  // TLA+ のモデルの遷移表を読んで、コードの遷移表と比べる
  { pattern: /^docs\/formal\//, tests: ['tests/unit/formal-models.test.ts'] },
];

/**
 * 変わったファイルから、走らせるテストを決める
 * @param {string[]} changed 変わったファイル（削除したものも含む）
 * @param {(path: string) => boolean} exists 手元にあるファイルか
 * @returns {{ all: true } | { all: false, files: string[] }} vitest に渡すファイル（削除したものは除く）。全件のときは all
 */
export function selectTests(changed, exists) {
  if (changed.some((path) => FULL_RUN_PATTERNS.some((pattern) => pattern.test(path)))) return { all: true };
  const extra = READ_BY_TESTS.filter(({ pattern }) => changed.some((path) => pattern.test(path))).flatMap(({ tests }) => tests);
  return { all: false, files: [...new Set([...changed.filter(exists), ...extra])] };
}

/** 標準入力から、変わったファイルのパスを読む。git diff -z の出力（NUL 区切り）をそのまま受ける。空白・日本語・改行を含む名前でも崩れない */
function changedPaths() {
  return readFileSync(0, 'utf8').split('\0').filter((path) => path !== '');
}

/** vitest を、このリポジトリに入れた版で走らせる。終了コードを返す */
function runVitest(/** @type {string[]} */ args) {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  const selection = selectTests(changedPaths(), existsSync);
  if (selection.all) {
    console.error('テスト全件を走らせます（import からは影響をたどれない変更があります）');
    return runVitest(['run']);
  }
  if (selection.files.length === 0) {
    console.error('関係するテストはありません');
    return 0;
  }
  // 関係するテストが見つからなくても失敗にしない。`-` で始まる名前は、オプションと取り違えないよう ./ を付ける
  return runVitest(['related', '--run', '--passWithNoTests', ...selection.files.map((file) => (file.startsWith('-') ? `./${file}` : file))]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
