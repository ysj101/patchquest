// TLA+ のモデル（docs/formal）を TLC で検査する。Java と tla2tools.jar が要る（docs/formal/README.md）。
// 使い方：JAVA_HOME=/path/to/jdk TLA2TOOLS=/path/to/tla2tools.jar node scripts/check-formal.mjs [設定名…]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMAL = fileURLToPath(new URL('../docs/formal/', import.meta.url));

/**
 * 検査するモデルと設定。violates があるものは、書き換える前の実装を再現した設定で、
 * その不変条件が破れること（反例が出ること）を確かめる
 */
/** @typedef {{ module: string, config?: string, violates?: string }} Check */
/** @type {Check[]} */
const CHECKS = [
  { module: 'Exercise' },
  { module: 'Runtime' },
  { module: 'Engine' },
  { module: 'Engine', config: 'EngineLegacy', violates: 'AtMostOneMachine' },
  { module: 'Preview' },
  { module: 'Evaluator' },
  { module: 'Storage' },
  { module: 'Storage', config: 'StorageLegacy', violates: 'NoLostWrite' },
  { module: 'SerialLatest' },
  { module: 'Navigation' },
  { module: 'Popover' },
  { module: 'Terminal' },
  { module: 'Guide' },
];

/**
 * TLC を 1 回走らせ、終了コードと出力を返す。作業用のファイルは一時ディレクトリに置き、終わったら消す
 * @param {{ java: string, jar: string }} tools
 * @param {Check} check
 */
function runTlc({ java, jar }, { module, config = module }) {
  const metadir = mkdtempSync(join(tmpdir(), 'patchquest-tlc-'));
  try {
    const args = ['-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', 'auto', '-metadir', metadir, '-config', `${config}.cfg`, `${module}.tla`];
    const { status, stdout, stderr, error } = spawnSync(java, args, { cwd: FORMAL, encoding: 'utf8' });
    if (error) throw new Error(`${java} を実行できません（${error.message}）`);
    return { status, output: `${stdout}${stderr}` };
  } finally {
    rmSync(metadir, { recursive: true, force: true });
  }
}

/**
 * 検査 1 件の結果。問題がなければ null、あれば理由を返す
 * @param {Check} check
 * @param {{ status: number | null, output: string }} result
 */
function failure(check, { status, output }) {
  if (check.violates) {
    const violated = output.includes(`Invariant ${check.violates} is violated`);
    return violated ? null : `不変条件 ${check.violates} が破れるはずが、破れませんでした`;
  }
  return status === 0 && output.includes('Model checking completed. No error has been found.') ? null : 'エラーが見つかりました';
}

const { JAVA_HOME: javaHome, TLA2TOOLS: jar } = process.env;
if (!javaHome || !jar || !existsSync(jar)) {
  console.error('環境変数 JAVA_HOME に Java の場所、TLA2TOOLS に tla2tools.jar の場所を指定してください（docs/formal/README.md）');
  process.exit(2);
}
const tools = { java: join(javaHome, 'bin', 'java'), jar };
const wanted = process.argv.slice(2);
const checks = CHECKS.filter(({ module, config = module }) => wanted.length === 0 || wanted.includes(config));
if (checks.length === 0) {
  console.error(`モデルがありません: ${wanted.join(', ')}`);
  process.exit(2);
}
let failed = 0;
for (const check of checks) {
  const name = check.config ?? check.module;
  const result = runTlc(tools, check);
  const reason = failure(check, result);
  const states = result.output.split('\n').filter((line) => line.includes('distinct states found')).at(-1)?.trim() ?? '';
  if (reason === null) {
    const note = check.violates ? `${check.violates} の反例を確認` : states;
    console.log(`✓ ${name}（${note}）`);
  } else {
    failed++;
    console.error(`✗ ${name}: ${reason}\n${result.output}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
