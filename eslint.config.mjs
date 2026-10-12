// コード品質の機械的な基準。人やAIが書いたコードを同じ物差しで止める。
// 導入時点で残っていた違反は eslint-suppressions.json に件数ごと記録してあり、
// 同じファイル・同じルールの違反が増えたときだけ失敗する。直したら `pnpm run lint:prune` で記録を減らす。
import eslint from '@eslint/js';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';

/** 製品コード（配布物に入るコード）。テストとビルド用スクリプトは含めない */
const PRODUCT = ['platform/**', 'runtimes/**', 'apps/**', 'missions/**', 'catalog/**'];

/**
 * 層の依存方向（README のディレクトリ構成を参照）。各層は allow に挙げた場所だけを import できる。
 * tests/ や scripts/ はどの層の allow にもないので、製品コードからは import できない。
 * 新しい依存を足すときは、ここを変える理由をレビューで説明する。
 */
const LAYERS = [
  { target: 'platform/main.ts', allow: ['platform/ui'], role: 'エントリポイント' },
  { target: 'platform/contract', allow: [], role: '課題パックとの契約（他の層に依存しない）' },
  { target: 'platform/evaluator', allow: ['platform/contract'], role: '採点' },
  { target: 'platform/orchestrator', allow: ['platform/contract', 'platform/evaluator'], role: '実行制御' },
  { target: 'platform/progress', allow: ['platform/contract'], role: '進捗の保存' },
  {
    target: 'platform/ui',
    // app.ts が全体を組み立てる。ブラウザ用アダプター以外の実行環境の中身には触れない
    allow: ['platform', 'catalog', 'runtimes/browser/adapter.ts'],
    role: '学習UI',
  },
  { target: 'runtimes/browser', allow: ['platform/contract', 'catalog'], role: 'ブラウザ用 RuntimeAdapter' },
  { target: 'apps/shared', allow: ['platform/contract'], role: '教材アプリの共通部品' },
  { target: 'apps/memo', allow: ['platform/contract', 'runtimes/browser', 'apps/shared'], role: '教材アプリ' },
  { target: 'missions', allow: ['platform/contract', 'apps'], role: '課題パック' },
  { target: 'catalog', allow: ['apps', 'missions', 'runtimes/browser'], role: '同梱パックの登録' },
];

// 層の表にない場所は依存の制限を受けないので、増えたら LAYERS に足すまで lint を止める
const uncovered = ['platform', 'runtimes', 'apps']
  .flatMap((parent) =>
    readdirSync(join(import.meta.dirname, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.name.endsWith('.ts'))
      .map((entry) => `${parent}/${entry.name}`),
  )
  .filter((path) => !LAYERS.some(({ target }) => target === path));
if (uncovered.length > 0) throw new Error(`eslint.config.mjs の LAYERS に層がありません: ${uncovered.join('、')}`);

const layerZones = LAYERS.map(({ target, allow, role }) => ({
  target: `./${target}`,
  from: '.',
  except: [`./${target}`, ...allow.map((path) => `./${path}`), './node_modules'],
  message: `${target}（${role}）から import できるのは ${allow.length > 0 ? allow.join('・') : '自分自身'} だけ。eslint.config.mjs の LAYERS を参照。`,
}));

export default defineConfig(
  includeIgnoreFile(join(import.meta.dirname, '.gitignore')),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // 大きさと複雑さ
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', { max: 4 }],
      'max-params': ['error', { max: 6 }],
      'sonarjs/cognitive-complexity': ['error', 15],

      // 読みやすさと事故の防止
      'id-length': ['error', { min: 2, properties: 'never', exceptions: ['_', 'i', 'j'] }],
      eqeqeq: 'error',
      'no-else-return': 'error',
      'no-param-reassign': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'enum は使わない。as const のオブジェクトか文字列リテラルのユニオン型にする。' },
      ],

      // 依存関係
      'import-x/no-cycle': 'error',

      // このリポジトリの書き方に合わせる
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `() => ctx.navigate(...)` や早期 return の `return void root.append(...)` は使ってよい
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true, ignoreVoidOperator: true }],
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      'sonarjs/void-use': 'off',
      // 既定の sort() や String#match で足りる箇所まで指摘して煩い
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/different-types-comparison': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      // @typescript-eslint/no-deprecated と同じ指摘。AWS CDK 向けのルールはこのリポジトリに当てはまらない
      'sonarjs/deprecation': 'off',
      ...Object.fromEntries(Object.keys(sonarjs.rules).filter((name) => name.startsWith('aws-')).map((name) => [`sonarjs/${name}`, 'off'])),
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: PRODUCT,
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: layerZones }],
    },
  },
  {
    // テストは前提・操作・確認を1つの関数に並べるほうが読みやすいので、関数の長さは問わない
    files: ['tests/**'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
);
