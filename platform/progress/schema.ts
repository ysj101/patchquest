// 進捗 JSON の検証（spec §13）。読み込んだ値は既知の項目だけを取り出して作り直し、
// 任意のコードや課題パックとして扱わない
import type {
  AttemptRecord,
  Badge,
  BadgeKind,
  ExerciseState,
  ResultGroup,
  TestOutcome,
  VerificationReport,
} from '../contract';
import { TRANSITIONS } from '../contract';

export const PROGRESS_FORMAT = 'patchquest-progress';
export const PROGRESS_SCHEMA_VERSION = 1;
/** 進捗 JSON の上限（初期案 1MB、spec §14） */
export const MAX_PROGRESS_BYTES = 1024 * 1024;
const MAX_ATTEMPTS = 1000;
const MAX_TEXT = 4096;

export interface ProgressFile {
  format: typeof PROGRESS_FORMAT;
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  exportedAt: string;
  attempts: AttemptRecord[];
}

export class ProgressFormatError extends Error {
  override name = 'ProgressFormatError';
}

type Obj = Record<string, unknown>;
const STATES = Object.keys(TRANSITIONS) as ExerciseState[];
const GROUPS: ResultGroup[] = ['attack', 'normal', 'regression'];
const BADGES: BadgeKind[] = ['reproduction', 'defense', 'understanding'];

function fail(path: string, message: string): never {
  throw new ProgressFormatError(`${path}: ${message}`);
}

function obj(path: string, v: unknown): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'オブジェクトが必要です');
  return v as Obj;
}

function str(path: string, v: unknown): string {
  if (typeof v !== 'string' || v.length > MAX_TEXT) fail(path, `${MAX_TEXT} 文字以内の文字列が必要です`);
  return v;
}

function optStr(path: string, v: unknown): string | undefined {
  return v === undefined ? undefined : str(path, v);
}

function num(path: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '数値が必要です');
  return v;
}

function bool(path: string, v: unknown): boolean {
  if (typeof v !== 'boolean') fail(path, '真偽値が必要です');
  return v;
}

function oneOf<T>(path: string, v: unknown, options: readonly T[]): T {
  if (!options.includes(v as T)) fail(path, `${options.join(' / ')} のいずれかが必要です`);
  return v as T;
}

function list(path: string, v: unknown, max: number): unknown[] {
  if (!Array.isArray(v)) fail(path, '配列が必要です');
  if (v.length > max) fail(path, `${max} 件以内にしてください`);
  return v;
}

function badge(path: string, v: unknown): Badge {
  const b = obj(path, v);
  const result: Badge = { achieved: bool(`${path}.achieved`, b.achieved) };
  for (const key of ['runId', 'configHash', 'at'] as const) {
    const value = optStr(`${path}.${key}`, b[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function outcome(path: string, v: unknown): TestOutcome {
  const o = obj(path, v);
  const result: TestOutcome = {
    testId: str(`${path}.testId`, o.testId),
    title: str(`${path}.title`, o.title),
    group: oneOf(`${path}.group`, o.group, GROUPS),
    passed: bool(`${path}.passed`, o.passed),
    expected: str(`${path}.expected`, o.expected),
    actual: str(`${path}.actual`, o.actual),
  };
  const error = optStr(`${path}.error`, o.error);
  if (error !== undefined) result.error = error;
  return result;
}

function report(path: string, v: unknown): VerificationReport | null {
  if (v === null) return null;
  const r = obj(path, v);
  return {
    runId: str(`${path}.runId`, r.runId),
    attemptId: str(`${path}.attemptId`, r.attemptId),
    configHash: str(`${path}.configHash`, r.configHash),
    outcomes: list(`${path}.outcomes`, r.outcomes, 500).map((o, i) => outcome(`${path}.outcomes[${i}]`, o)),
    passed: bool(`${path}.passed`, r.passed),
    startedAt: str(`${path}.startedAt`, r.startedAt),
    elapsedMs: num(`${path}.elapsedMs`, r.elapsedMs),
  };
}

export function parseAttempt(path: string, v: unknown): AttemptRecord {
  const a = obj(path, v);
  const badges = obj(`${path}.badges`, a.badges);
  const answers = obj(`${path}.answers`, a.answers);
  return {
    attemptId: str(`${path}.attemptId`, a.attemptId),
    missionId: str(`${path}.missionId`, a.missionId),
    missionVersion: str(`${path}.missionVersion`, a.missionVersion),
    variantId: str(`${path}.variantId`, a.variantId),
    recipeId: str(`${path}.recipeId`, a.recipeId),
    recipeVersion: str(`${path}.recipeVersion`, a.recipeVersion),
    appId: str(`${path}.appId`, a.appId),
    appVersion: str(`${path}.appVersion`, a.appVersion),
    seed: num(`${path}.seed`, a.seed),
    fixtureHash: str(`${path}.fixtureHash`, a.fixtureHash),
    createdAt: str(`${path}.createdAt`, a.createdAt),
    state: oneOf(`${path}.state`, a.state, STATES),
    configHash: str(`${path}.configHash`, a.configHash),
    appliedDefense: a.appliedDefense === null ? null : str(`${path}.appliedDefense`, a.appliedDefense),
    badges: Object.fromEntries(BADGES.map((k) => [k, badge(`${path}.badges.${k}`, badges[k])])) as Record<BadgeKind, Badge>,
    lastVerification: report(`${path}.lastVerification`, a.lastVerification),
    hintsOpened: list(`${path}.hintsOpened`, a.hintsOpened, 3).map((h, i) => oneOf(`${path}.hintsOpened[${i}]`, h, [1, 2, 3] as const)),
    solutionViewed: bool(`${path}.solutionViewed`, a.solutionViewed),
    answers: Object.fromEntries(Object.entries(answers).slice(0, 50).map(([k, val]) => [str(`${path}.answers`, k), str(`${path}.answers.${k}`, val)])),
  };
}

/** 進捗 JSON を検証して読み込む。サイズ・形式・版・各項目の違反は ProgressFormatError */
export function parseProgress(text: string): ProgressFile {
  if (new TextEncoder().encode(text).length > MAX_PROGRESS_BYTES) {
    throw new ProgressFormatError(`ファイルが大きすぎます（上限 ${MAX_PROGRESS_BYTES / 1024 / 1024}MB）`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProgressFormatError('JSON として読み込めません');
  }
  const root = obj('進捗', value);
  if (root.format !== PROGRESS_FORMAT) fail('format', 'PatchQuest の進捗ファイルではありません');
  if (root.schemaVersion !== PROGRESS_SCHEMA_VERSION) fail('schemaVersion', `対応していない版です（対応: ${PROGRESS_SCHEMA_VERSION}）`);
  return {
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: str('exportedAt', root.exportedAt),
    attempts: list('attempts', root.attempts, MAX_ATTEMPTS).map((a, i) => parseAttempt(`attempts[${i}]`, a)),
  };
}
