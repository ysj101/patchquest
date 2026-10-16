// 書き出した進捗 JSON（1 ファイル = 1 人）から、効果の検証の指標（docs/evaluation-metrics.md）を集計する。
// 進捗の形式とステージの判定は platform/progress（schema.ts・stages.ts）と同じ定義をここに書き写している（製品コードは TypeScript で、
// このスクリプトからは読み込まない）。定義を変えたら両方を直す。読み込む JSON は信頼せず、形式を確かめて壊れたファイルは理由を出して飛ばす
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { listFiles } from './scan.mjs';

/** platform/progress/schema.ts と同じ値 */
export const PROGRESS_FORMAT = 'patchquest-progress';
export const PROGRESS_SCHEMA_VERSIONS = { oldest: 1, newest: 9 };
export const MAX_PROGRESS_BYTES = 1024 * 1024;

/**
 * @typedef {{ briefedAt: string | null, firstRequestAt: string | null, firstDefenseAt: string | null }} Milestones
 * @typedef {{ reproduction: boolean, defense: boolean, understanding: boolean }} Badges
 * @typedef {{ attemptId: string, missionId: string, variantId: string, seed: number, createdAt: string, milestones: Milestones, badges: Badges, answered: boolean }} Attempt
 * @typedef {{ attempts: Attempt[] }} Participant
 * @typedef {{ numerator: number, denominator: number, rate: number | null }} Rate
 * @typedef {{ missionId: string, stages: Record<string, Rate>, completion: Rate, retry: Rate, transferCheck: Rate }} MissionMetrics
 * @typedef {{ participants: number, firstStart: Rate, missions: MissionMetrics[] }} Metrics
 */

/**
 * platform/progress/stages.ts の STAGES と stageStates（防御は記録上の達成で数える）と同じ定義
 * @type {{ id: string, label: string, reached: (attempt: Attempt) => boolean }[]}
 */
export const STAGES = [
  { id: 'briefed', label: '事件を確認', reached: (attempt) => attempt.milestones.briefedAt !== null },
  { id: 'investigated', label: '手がかりを探す', reached: (attempt) => attempt.milestones.firstRequestAt !== null },
  { id: 'reproduced', label: '脆弱性を再現', reached: (attempt) => attempt.badges.reproduction },
  { id: 'repaired', label: '対策する', reached: (attempt) => attempt.milestones.firstDefenseAt !== null },
  { id: 'verified', label: '最終検証', reached: (attempt) => attempt.badges.defense && attempt.badges.understanding },
];

export class ProgressFileError extends Error {
  name = 'ProgressFileError';
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {string} path
 * @param {string} message
 * @returns {never}
 */
function fail(path, message) {
  throw new ProgressFileError(`${path}: ${message}`);
}

/**
 * @param {string} path
 * @param {unknown} value
 */
function nonEmptyText(path, value) {
  if (typeof value !== 'string' || value === '') fail(path, '空でない文字列が必要です');
  return value;
}

/**
 * 旧版（milestones がない）も読む。null か文字列以外は壊れている
 * @param {string} path
 * @param {unknown} value
 * @returns {Milestones}
 */
function readMilestones(path, value) {
  if (value === undefined) return { briefedAt: null, firstRequestAt: null, firstDefenseAt: null };
  if (!isObject(value)) fail(path, 'オブジェクトが必要です');
  /** @param {string} key */
  const read = (key) => {
    const at = value[key];
    if (at !== null && typeof at !== 'string') fail(`${path}.${key}`, 'null か文字列が必要です');
    return at;
  };
  return { briefedAt: read('briefedAt'), firstRequestAt: read('firstRequestAt'), firstDefenseAt: read('firstDefenseAt') };
}

/**
 * @param {string} path
 * @param {unknown} value
 * @returns {Badges}
 */
function readBadges(path, value) {
  if (!isObject(value)) fail(path, 'オブジェクトが必要です');
  /** @param {string} kind */
  const read = (kind) => {
    const badge = value[kind];
    if (!isObject(badge) || typeof badge.achieved !== 'boolean') fail(`${path}.${kind}.achieved`, '真偽値が必要です');
    return badge.achieved;
  };
  return { reproduction: read('reproduction'), defense: read('defense'), understanding: read('understanding') };
}

/**
 * 集計に使う項目だけを取り出す。知らない項目は無視する
 * @param {string} path
 * @param {unknown} value
 * @returns {Attempt}
 */
function readAttempt(path, value) {
  if (!isObject(value)) fail(path, 'オブジェクトが必要です');
  const seed = value.seed;
  if (typeof seed !== 'number' || !Number.isInteger(seed)) fail(`${path}.seed`, '整数が必要です');
  if (!isObject(value.answers)) fail(`${path}.answers`, 'オブジェクトが必要です');
  return {
    attemptId: nonEmptyText(`${path}.attemptId`, value.attemptId),
    missionId: nonEmptyText(`${path}.missionId`, value.missionId),
    variantId: nonEmptyText(`${path}.variantId`, value.variantId),
    seed,
    createdAt: nonEmptyText(`${path}.createdAt`, value.createdAt),
    milestones: readMilestones(`${path}.milestones`, value.milestones),
    badges: readBadges(`${path}.badges`, value.badges),
    answered: Object.keys(value.answers).length > 0,
  };
}

/**
 * 進捗 JSON の文字列を検証して、集計に使う形にする。
 * @param {string} text
 * @returns {Participant}
 */
export function parseProgressExport(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_PROGRESS_BYTES) fail('ファイル', `大きすぎます（上限 ${MAX_PROGRESS_BYTES / 1024 / 1024}MB）`);
  /** @type {unknown} */
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    fail('ファイル', 'JSON として読み込めません');
  }
  if (!isObject(root)) fail('進捗', 'オブジェクトが必要です');
  if (root.format !== PROGRESS_FORMAT) fail('format', 'PatchQuest の進捗ファイルではありません');
  const { oldest, newest } = PROGRESS_SCHEMA_VERSIONS;
  const version = root.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < oldest || version > newest) {
    fail('schemaVersion', `対応していない版です（対応: ${oldest}〜${newest}）`);
  }
  const attempts = root.attempts;
  if (!Array.isArray(attempts)) fail('attempts', '配列が必要です');
  return { attempts: attempts.map((attempt, index) => readAttempt(`attempts[${index}]`, attempt)) };
}

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {Rate}
 */
const rate = (numerator, denominator) => ({ numerator, denominator, rate: denominator === 0 ? null : numerator / denominator });
/** @param {Attempt} attempt */
const completed = (attempt) => attempt.badges.reproduction && attempt.badges.defense && attempt.badges.understanding;

/**
 * 1 人の記録を課題ごとにまとめる
 * @param {Attempt[]} attempts
 * @param {string[] | null} missionIds
 */
function byMission(attempts, missionIds) {
  /** @type {Map<string, Attempt[]>} */
  const groups = new Map();
  for (const attempt of attempts) {
    if (missionIds && !missionIds.includes(attempt.missionId)) continue;
    const group = groups.get(attempt.missionId) ?? [];
    group.push(attempt);
    groups.set(attempt.missionId, group);
  }
  return groups;
}

/**
 * @param {string} missionId
 * @param {Attempt[][]} perParticipant 参加者ごとの、この課題の演習
 * @returns {MissionMetrics}
 */
function missionMetrics(missionId, perParticipant) {
  const started = perParticipant.filter((attempts) => attempts.length > 0);
  const attempts = started.flat();
  /** @param {Attempt[]} list */
  const seeds = (list) => new Set(list.map((attempt) => `${attempt.variantId}\u0000${attempt.seed}`)).size;
  return {
    missionId,
    stages: Object.fromEntries(STAGES.map((stage) => [stage.id, rate(attempts.filter(stage.reached).length, attempts.length)])),
    completion: rate(started.filter((list) => list.some(completed)).length, started.length),
    retry: rate(started.filter((list) => seeds(list) >= 2).length, started.length),
    transferCheck: rate(attempts.filter((attempt) => attempt.badges.understanding).length, attempts.filter((attempt) => attempt.answered).length),
  };
}

/**
 * 参加者ごとの進捗から指標を集計する。
 * @param {Participant[]} participants 1 要素が 1 人分
 * @param {{ missionIds?: string[] }} options 集計する課題 ID。省略時は記録にあるすべて
 * @returns {Metrics}
 */
export function collectMetrics(participants, options = {}) {
  const grouped = participants.map((participant) => byMission(participant.attempts, options.missionIds ?? null));
  const missionIds = options.missionIds ?? [...new Set(grouped.flatMap((groups) => [...groups.keys()]))].sort();
  return {
    participants: participants.length,
    firstStart: rate(grouped.filter((groups) => groups.size > 0).length, participants.length),
    missions: missionIds.map((missionId) => missionMetrics(missionId, grouped.map((groups) => groups.get(missionId) ?? []))),
  };
}

/**
 * ファイル・ディレクトリの指定から、進捗 JSON の一覧を作る（ディレクトリは配下の .json を名前順）
 * @param {string[]} paths
 */
export async function listProgressFiles(paths) {
  /** @type {string[]} */
  const files = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (!info) throw new Error(`${path} が見つかりません`);
    files.push(...(info.isDirectory() ? (await listFiles(path, ['.json'])).sort() : [path]));
  }
  return files;
}

/**
 * 読めたファイルだけを参加者として返し、壊れたファイルは理由とともに skipped に入れる
 * @param {string[]} files
 */
export async function loadParticipants(files) {
  /** @type {(Participant & { file: string })[]} */
  const participants = [];
  /** @type {{ file: string, reason: string }[]} */
  const skipped = [];
  for (const file of files) {
    try {
      participants.push({ file, ...parseProgressExport(await readFile(file, 'utf8')) });
    } catch (error) {
      if (!(error instanceof ProgressFileError)) throw error;
      skipped.push({ file, reason: error.message });
    }
  }
  return { participants, skipped };
}

/** @param {Rate} value */
const percent = ({ numerator, denominator, rate: ratio }) => (ratio === null ? '—（分母 0）' : `${(ratio * 100).toFixed(0)}%（${numerator}/${denominator}）`);

/**
 * 指標を人が読む表にする
 * @param {Metrics} metrics
 */
export function formatMetrics(metrics) {
  const lines = [`参加者 ${metrics.participants} 人`, `初回開始率: ${percent(metrics.firstStart)}`];
  for (const mission of metrics.missions) {
    lines.push('', `## ${mission.missionId}`);
    for (const stage of STAGES) lines.push(`ステージ到達率（${stage.label}）: ${percent(mission.stages[stage.id] ?? rate(0, 0))}`);
    lines.push(
      `ミッション完了率: ${percent(mission.completion)}`,
      `再挑戦率（別 seed で 2 回以上）: ${percent(mission.retry)}`,
      `理解確認の正答率（回答した演習のうち理解の達成印）: ${percent(mission.transferCheck)}`,
    );
  }
  lines.push('', '翌週の再訪意向は観察セッションの聞き取りで記録する（docs/evaluation-metrics.md）');
  return lines.join('\n');
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ json: boolean, missionIds: string[] | undefined, paths: string[] }} */
  const options = { json: false, missionIds: undefined, paths: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--') continue; // pnpm run が引数の前に挟む区切り
    if (arg === '--json') options.json = true;
    else if (arg === '--missions') options.missionIds = (argv[++index] ?? '').split(',').filter(Boolean);
    else if (arg !== undefined) options.paths.push(arg);
  }
  if (options.paths.length === 0) throw new Error('使い方: node scripts/evaluation-metrics.mjs [--json] [--missions idor,stored-xss,sqli] <進捗JSON かディレクトリ>...');
  if (options.missionIds?.length === 0) throw new Error('--missions には課題 ID をコンマ区切りで指定してください');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { participants, skipped } = await loadParticipants(await listProgressFiles(options.paths));
  for (const { file, reason } of skipped) console.error(`飛ばしました: ${file}（${reason}）`);
  const metrics = collectMetrics(participants, { missionIds: options.missionIds });
  console.log(options.json ? JSON.stringify({ ...metrics, skipped }, null, 2) : formatMetrics(metrics));
  if (skipped.length > 0) console.error(`${skipped.length} 件のファイルを飛ばしました`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((/** @type {unknown} */ error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
