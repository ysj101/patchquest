// 進捗 JSON の検証（spec §13）。既知の項目だけを作り直す。schemaVersion 1 は 2 へ変換する
import {
  BADGE_KINDS,
  Checker,
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
export const PROGRESS_SCHEMA_VERSION = 2;
/** 進捗 JSON の上限（初期案 1MB、spec §14）。profile を含むファイル全体に適用する */
export const MAX_PROGRESS_BYTES = 1024 * 1024;
/** 配列の件数上限（操作履歴 1000 件、spec §14）。attempts と profile の両方に使う */
export const MAX_ATTEMPTS = 1000;
/** 文字列 1 件の上限（入力 1 件 4KB、spec §14） */
export const MAX_TEXT = 4096;
const STATES = Object.keys(TRANSITIONS) as ExerciseState[];

/**
 * 演習をまたぐ記録の 1 件。識別子以外の項目（ステージ到達・XP・実績）は後続の課題でこの型に足す。
 * 未知の項目は取り込まない。
 */
export interface ProfileEntry {
  /** MAX_TEXT 以内 */
  id: string;
}

/**
 * 演習をまたぐ記録の置き場所（spec §13）。
 * ステージ到達・XP・実績の解除の中身は #67・#71・#73 で決める。いまは識別子の並びだけを検証する。
 */
export interface CrossAttemptProfile {
  /** 件数は MAX_ATTEMPTS まで */
  entries: ProfileEntry[];
}

export interface ProgressFile {
  format: typeof PROGRESS_FORMAT;
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  exportedAt: string;
  attempts: AttemptRecord[];
  /** 演習をまたぐ記録。Attempt とは別に保存する */
  profile: CrossAttemptProfile;
}

/** parseProgress の結果。replaceProfile が false の v1 ファイルは、保存済みの profile を上書きしない */
export interface ParsedProgress {
  file: ProgressFile;
  replaceProfile: boolean;
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

/** 演習をまたぐ記録がまだ無いときの値。schemaVersion 1 を 2 に変換するときもこれを使う */
export function emptyProfile(): CrossAttemptProfile {
  return { entries: [] };
}

function profileEntry(checker: Checker, path: string, value: unknown): ProfileEntry {
  const entry = checker.obj(path, value);
  return { id: checker.str(`${path}.id`, entry.id, MAX_TEXT) };
}

/** profile を既知の項目だけに作り直す。文字列は MAX_TEXT、件数は MAX_ATTEMPTS */
function readProfile(checker: Checker, value: unknown): CrossAttemptProfile {
  const source = checker.obj('profile', value);
  const entries = checker.list('profile.entries', source.entries);
  if (entries.length > MAX_ATTEMPTS) checker.fail('profile.entries', `${MAX_ATTEMPTS} 件以内にしてください`);
  return {
    entries: entries.slice(0, MAX_ATTEMPTS).map((entry, index) => profileEntry(checker, `profile.entries[${index}]`, entry)),
  };
}

function supportedSchemaVersion(value: unknown): 1 | typeof PROGRESS_SCHEMA_VERSION {
  if (value === 1 || value === PROGRESS_SCHEMA_VERSION) return value;
  throw new ProgressFormatError(`schemaVersion: 対応していない版です（対応: 1〜${PROGRESS_SCHEMA_VERSION}）`);
}

function byteLength(text: string): number {
  // UTF-8 では 1 つの UTF-16 単位が最大 3 バイト。それで収まるなら数えずに済ませる
  return text.length * 3 <= MAX_PROGRESS_BYTES ? text.length : new TextEncoder().encode(text).length;
}

/** 進捗 JSON を検証して読み込む。サイズ・形式・版・各項目の違反は ProgressFormatError */
export function parseProgress(text: string): ParsedProgress {
  if (byteLength(text) > MAX_PROGRESS_BYTES) {
    throw new ProgressFormatError(`ファイルが大きすぎます（上限 ${MAX_PROGRESS_BYTES / 1024 / 1024}MB）`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProgressFormatError('JSON として読み込めません');
  }
  const checker = new Checker();
  const root = checker.obj('進捗', value);
  if (root.format !== PROGRESS_FORMAT) throw new ProgressFormatError('format: PatchQuest の進捗ファイルではありません');
  const version = supportedSchemaVersion(root.schemaVersion);
  const attempts = checker.list('attempts', root.attempts);
  if (attempts.length > MAX_ATTEMPTS) checker.fail('attempts', `${MAX_ATTEMPTS} 件以内にしてください`);
  const file: ProgressFile = {
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: checker.str('exportedAt', root.exportedAt, MAX_TEXT),
    attempts: attempts.slice(0, MAX_ATTEMPTS).map((item, index) => attempt(checker, `attempts[${index}]`, item)),
    profile: version === 1 ? emptyProfile() : readProfile(checker, root.profile),
  };
  if (checker.errors.length > 0) throw new ProgressFormatError(checker.errors.slice(0, 5).join('\n'));
  return { file, replaceProfile: version === PROGRESS_SCHEMA_VERSION };
}
