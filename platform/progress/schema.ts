// 進捗 JSON の検証（spec §13）。読み込んだ値は既知の項目だけを取り出して作り直し、
// 任意のコードや課題パックとして扱わない
import {
  BADGE_KINDS,
  Checker,
  emptyMilestones,
  RESULT_GROUPS,
  TRANSITIONS,
  type AttemptRecord,
  type Badge,
  type BadgeKind,
  type ExerciseState,
  type TestOutcome,
  type VerificationReport,
} from '../contract';

export const PROGRESS_FORMAT = 'patchquest-progress';
export const PROGRESS_SCHEMA_VERSION = 3;
// 読み込める最も古い版。spec §13 に従い、版を上げても旧版の読み込みを維持する。
const OLDEST_READABLE_SCHEMA_VERSION = 1;
// 演習をまたぐ記録の入れ物 profile が加わった版。
const PROFILE_SINCE_SCHEMA_VERSION = 2;
/** 進捗 JSON の上限（初期案 1MB、spec §14） */
export const MAX_PROGRESS_BYTES = 1024 * 1024;
const MAX_ATTEMPTS = 1000;
const MAX_TEXT = 4096;
const STATES = Object.keys(TRANSITIONS) as ExerciseState[];

/** 演習をまたぐ記録。既知の項目はまだなく、#71・#73 でここに追加する。
 * 演習内のステージ（spec §9）は Attempt の milestones と達成印から導くので profile には持たない。spec §13 の「ステージ到達」はこの意味で Attempt から再計算する。
 */
export type ProgressProfile = Record<string, never>;

export interface ProgressFile {
  format: typeof PROGRESS_FORMAT;
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  exportedAt: string;
  attempts: AttemptRecord[];
  profile: ProgressProfile;
}

export class ProgressFormatError extends Error {
  override name = 'ProgressFormatError';
}

/** 任意の項目は、値があるときだけ取り出す */
function optional<T>(v: unknown, read: () => T): T | undefined {
  return v === undefined ? undefined : read();
}

function badge(c: Checker, path: string, v: unknown): Badge {
  const b = c.obj(path, v);
  const runId = optional(b.runId, () => c.str(`${path}.runId`, b.runId, MAX_TEXT));
  const configHash = optional(b.configHash, () => c.str(`${path}.configHash`, b.configHash, MAX_TEXT));
  const at = optional(b.at, () => c.str(`${path}.at`, b.at, MAX_TEXT));
  return {
    achieved: c.bool(`${path}.achieved`, b.achieved),
    ...(runId !== undefined && { runId }),
    ...(configHash !== undefined && { configHash }),
    ...(at !== undefined && { at }),
  };
}

function outcome(c: Checker, path: string, v: unknown): TestOutcome {
  const o = c.obj(path, v);
  const error = optional(o.error, () => c.str(`${path}.error`, o.error, MAX_TEXT));
  return {
    testId: c.str(`${path}.testId`, o.testId, MAX_TEXT),
    title: c.str(`${path}.title`, o.title, MAX_TEXT),
    group: c.oneOf(`${path}.group`, o.group, RESULT_GROUPS),
    passed: c.bool(`${path}.passed`, o.passed),
    expected: c.str(`${path}.expected`, o.expected, MAX_TEXT),
    actual: c.str(`${path}.actual`, o.actual, MAX_TEXT),
    ...(error !== undefined && { error }),
  };
}

function report(c: Checker, path: string, v: unknown): VerificationReport | null {
  if (v === null) return null;
  const r = c.obj(path, v);
  return {
    runId: c.str(`${path}.runId`, r.runId, MAX_TEXT),
    attemptId: c.str(`${path}.attemptId`, r.attemptId, MAX_TEXT),
    configHash: c.str(`${path}.configHash`, r.configHash, MAX_TEXT),
    outcomes: c.list(`${path}.outcomes`, r.outcomes).slice(0, 500).map((o, i) => outcome(c, `${path}.outcomes[${i}]`, o)),
    passed: c.bool(`${path}.passed`, r.passed),
    startedAt: c.str(`${path}.startedAt`, r.startedAt, MAX_TEXT),
    elapsedMs: c.num(`${path}.elapsedMs`, r.elapsedMs),
  };
}

function milestones(checker: Checker, path: string, value: unknown): AttemptRecord['milestones'] {
  if (value === undefined) return emptyMilestones();
  const record = checker.obj(path, value);
  const read = (key: string) => record[key] === null ? null : checker.str(`${path}.${key}`, record[key], MAX_TEXT);
  return { briefedAt: read('briefedAt'), firstRequestAt: read('firstRequestAt'), firstDefenseAt: read('firstDefenseAt') };
}

function attempt(c: Checker, path: string, v: unknown): AttemptRecord {
  const a = c.obj(path, v);
  const text = (key: string) => c.str(`${path}.${key}`, a[key], MAX_TEXT);
  const badges = c.obj(`${path}.badges`, a.badges);
  const answers = c.obj(`${path}.answers`, a.answers);
  return {
    attemptId: text('attemptId'),
    missionId: text('missionId'),
    missionVersion: text('missionVersion'),
    variantId: text('variantId'),
    recipeId: text('recipeId'),
    recipeVersion: text('recipeVersion'),
    appId: text('appId'),
    appVersion: text('appVersion'),
    seed: c.num(`${path}.seed`, a.seed),
    fixtureHash: text('fixtureHash'),
    createdAt: text('createdAt'),
    state: c.oneOf(`${path}.state`, a.state, STATES),
    configHash: text('configHash'),
    milestones: milestones(c, `${path}.milestones`, a.milestones),
    appliedDefense: a.appliedDefense === null ? null : text('appliedDefense'),
    badges: Object.fromEntries(BADGE_KINDS.map((k) => [k, badge(c, `${path}.badges.${k}`, badges[k])])) as Record<BadgeKind, Badge>,
    lastVerification: report(c, `${path}.lastVerification`, a.lastVerification),
    hintsOpened: c.list(`${path}.hintsOpened`, a.hintsOpened).slice(0, 3).map((h, i) => c.oneOf(`${path}.hintsOpened[${i}]`, h, [1, 2, 3] as const)),
    solutionViewed: c.bool(`${path}.solutionViewed`, a.solutionViewed),
    answers: Object.fromEntries(
      Object.entries(answers)
        .slice(0, 50)
        .map(([k, val]) => [c.str(`${path}.answers`, k, MAX_TEXT), c.str(`${path}.answers.${k}`, val, MAX_TEXT)]),
    ),
  };
}

function byteLength(text: string): number {
  // UTF-8 では 1 つの UTF-16 単位が最大 3 バイト。それで収まるなら数えずに済ませる
  return text.length * 3 <= MAX_PROGRESS_BYTES ? text.length : new TextEncoder().encode(text).length;
}

/** 進捗 JSON を検証して読み込む。サイズ・形式・版・各項目の違反は ProgressFormatError */
export function parseProgress(text: string): ProgressFile {
  if (byteLength(text) > MAX_PROGRESS_BYTES) {
    throw new ProgressFormatError(`ファイルが大きすぎます（上限 ${MAX_PROGRESS_BYTES / 1024 / 1024}MB）`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProgressFormatError('JSON として読み込めません');
  }
  const c = new Checker();
  const root = c.obj('進捗', value);
  if (root.format !== PROGRESS_FORMAT) throw new ProgressFormatError('format: PatchQuest の進捗ファイルではありません');
  const schemaVersion = root.schemaVersion;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)
    || schemaVersion < OLDEST_READABLE_SCHEMA_VERSION || schemaVersion > PROGRESS_SCHEMA_VERSION) {
    throw new ProgressFormatError(`schemaVersion: 対応していない版です（対応: ${OLDEST_READABLE_SCHEMA_VERSION}〜${PROGRESS_SCHEMA_VERSION}）`);
  }
  // v1 には profile が無い。v2 では入れ物がオブジェクトであることだけ確かめ、既知の項目はまだ無いので中身は捨てる
  if (schemaVersion >= PROFILE_SINCE_SCHEMA_VERSION) c.obj('profile', root.profile);
  const attempts = c.list('attempts', root.attempts);
  if (attempts.length > MAX_ATTEMPTS) c.fail('attempts', `${MAX_ATTEMPTS} 件以内にしてください`);
  const file: ProgressFile = {
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: c.str('exportedAt', root.exportedAt, MAX_TEXT),
    attempts: attempts.slice(0, MAX_ATTEMPTS).map((a, i) => attempt(c, `attempts[${i}]`, a)),
    profile: {},
  };
  if (c.errors.length) throw new ProgressFormatError(c.errors.slice(0, 5).join('\n'));
  return file;
}
