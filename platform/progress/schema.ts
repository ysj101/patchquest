// 進捗 JSON の検証（spec §13）。読み込んだ値は既知の項目だけを取り出して作り直し、
// 任意のコードや課題パックとして扱わない
import {
  BADGE_KINDS,
  Checker,
  emptyMilestones,
  completeAttempt,
  RESULT_GROUPS,
  TRANSITIONS,
  type AttemptRecord,
  type Badge,
  type BadgeKind,
  type ExerciseState,
  type TestOutcome,
  type VerificationReport,
} from '../contract';

import { ACHIEVEMENTS } from './achievements';
import { MAX_TEXT, count, readHistory } from './history';
import { MAX_REVIEWS, type ReviewEntry } from './review';
import { WEEKLY_GOAL_IDS, type WeeklyGoalId } from './weekly-goal';

export const PROGRESS_FORMAT = 'patchquest-progress';

export const PROGRESS_SCHEMA_VERSION = 9;
// 読み込める最も古い版。spec §13 に従い、版を上げても旧版の読み込みを維持する。
const OLDEST_READABLE_SCHEMA_VERSION = 1;
// 演習をまたぐ記録の入れ物 profile が加わった版。
const PROFILE_SINCE_SCHEMA_VERSION = 2;
// 別条件での挑戦（challenge）が加わった版。これより前の記録は通常の演習として読む。
const CHALLENGE_SINCE_SCHEMA_VERSION = 8;
/** 進捗 JSON の上限（初期案 1MB、spec §14） */
export const MAX_PROGRESS_BYTES = 1024 * 1024;
const MAX_ATTEMPTS = 1000;
const STATES = Object.keys(TRANSITIONS) as ExerciseState[];

/** 演習をまたぐ記録。XP の合計と実績の解除日時を保存し、Attempt の記録から照合する。
 * 演習内のステージ（spec §9）は Attempt の milestones と達成印から導くので profile には持たない。spec §13 の「ステージ到達」はこの意味で Attempt から再計算する。
 * 復習の回答（reviews）と週間目標（weeklyGoal）は Attempt から導けないため、そのまま保存する（v9 から）。
 */
export type ProgressProfile = {
  xp?: { total: number };
  achievements?: Record<string, string>;
  reviews?: ReviewEntry[];
  weeklyGoal?: WeeklyGoalId;
};

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

function firstPass(checker: Checker, path: string, value: unknown): AttemptRecord['firstPass'] {
  if (value === null) return null;
  const record = checker.obj(path, value);
  const verifications = count(checker, `${path}.verifications`, record.verifications);
  if (verifications === 0) checker.fail(`${path}.verifications`, '正の整数が必要です');
  return {
    at: checker.str(`${path}.at`, record.at, MAX_TEXT), verifications,
    normalBroken: checker.bool(`${path}.normalBroken`, record.normalBroken),
    hintsUsed: checker.bool(`${path}.hintsUsed`, record.hintsUsed),
  };
}

function challenge(checker: Checker, path: string, value: unknown, version: number): AttemptRecord['challenge'] {
  if (value === null || (value === undefined && version < CHALLENGE_SINCE_SCHEMA_VERSION)) return null;
  const record = checker.obj(path, value);
  return {
    questionIds: checker.list(`${path}.questionIds`, record.questionIds, true).slice(0, 50).map((id, index) => checker.str(`${path}.questionIds[${index}]`, id, MAX_TEXT)),
    repeatsPrevious: checker.bool(`${path}.repeatsPrevious`, record.repeatsPrevious),
  };
}

function verificationFacts(checker: Checker, path: string, record: Record<string, unknown>, version: number) {
  return {
    ...(version >= 7 || record.firstPass !== undefined ? { firstPass: firstPass(checker, `${path}.firstPass`, record.firstPass) } : {}),
    ...(version >= 7 || record.verifications !== undefined ? { verifications: count(checker, `${path}.verifications`, record.verifications) } : {}),
    ...(version >= 7 || record.normalBroken !== undefined ? { normalBroken: checker.bool(`${path}.normalBroken`, record.normalBroken) } : {}),
  };
}

function attempt(c: Checker, path: string, v: unknown, version: number): AttemptRecord {
  const a = c.obj(path, v);
  const text = (key: string) => c.str(`${path}.${key}`, a[key], MAX_TEXT);
  const badges = c.obj(`${path}.badges`, a.badges);
  const answers = c.obj(`${path}.answers`, a.answers);
  return completeAttempt({
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
    history: readHistory(c, `${path}.history`, a.history),
    ...verificationFacts(c, path, a, version),
    lastVerification: report(c, `${path}.lastVerification`, a.lastVerification),
    hintsOpened: c.list(`${path}.hintsOpened`, a.hintsOpened).slice(0, 3).map((h, i) => c.oneOf(`${path}.hintsOpened[${i}]`, h, [1, 2, 3] as const)),
    solutionViewed: c.bool(`${path}.solutionViewed`, a.solutionViewed),
    answers: Object.fromEntries(
      Object.entries(answers)
        .slice(0, 50)
        .map(([k, val]) => [c.str(`${path}.answers`, k, MAX_TEXT), c.str(`${path}.answers.${k}`, val, MAX_TEXT)]),
    ),
    challenge: challenge(c, `${path}.challenge`, a.challenge, version),
  });
}

function byteLength(text: string): number {
  // UTF-8 では 1 つの UTF-16 単位が最大 3 バイト。それで収まるなら数えずに済ませる
  return text.length * 3 <= MAX_PROGRESS_BYTES ? text.length : new TextEncoder().encode(text).length;
}

function readProfile(checker: Checker, value: unknown): ProgressProfile {
  const profile = checker.obj('profile', value);
  const result: ProgressProfile = {};
  if (profile.xp !== undefined) {
    const xp = checker.obj('profile.xp', profile.xp);
    result.xp = { total: count(checker, 'profile.xp.total', xp.total) };
  }
  if (profile.achievements !== undefined) {
    const saved = checker.obj('profile.achievements', profile.achievements);
    result.achievements = Object.fromEntries(ACHIEVEMENTS.filter(({ id }) => Object.hasOwn(saved, id))
      .map(({ id }) => [id, checker.str(`profile.achievements.${id}`, saved[id], MAX_TEXT)]));
  }
  if (profile.reviews !== undefined) result.reviews = readReviews(checker, profile.reviews);
  if (profile.weeklyGoal !== undefined) result.weeklyGoal = checker.oneOf('profile.weeklyGoal', profile.weeklyGoal, WEEKLY_GOAL_IDS);
  return result;
}

/** 復習の回答。上限を超えたら最新の分だけを保持する */
function readReviews(checker: Checker, value: unknown): ReviewEntry[] {
  const records = checker.list('profile.reviews', value);
  const start = Math.max(0, records.length - MAX_REVIEWS);
  return records.slice(start).map((raw, index) => {
    const path = `profile.reviews[${start + index}]`;
    const record = checker.obj(path, raw);
    return {
      at: checker.str(`${path}.at`, record.at, MAX_TEXT),
      missionId: checker.text(`${path}.missionId`, record.missionId),
      questionId: checker.text(`${path}.questionId`, record.questionId),
      correct: checker.bool(`${path}.correct`, record.correct),
    };
  });
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
  const profile = schemaVersion >= PROFILE_SINCE_SCHEMA_VERSION ? readProfile(c, root.profile) : {};
  const attempts = c.list('attempts', root.attempts);
  if (attempts.length > MAX_ATTEMPTS) c.fail('attempts', `${MAX_ATTEMPTS} 件以内にしてください`);
  const file: ProgressFile = {
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: c.str('exportedAt', root.exportedAt, MAX_TEXT),
    attempts: attempts.slice(0, MAX_ATTEMPTS).map((a, i) => attempt(c, `attempts[${i}]`, a, schemaVersion)),
    profile,
  };
  if (c.errors.length) throw new ProgressFormatError(c.errors.slice(0, 5).join('\n'));
  return file;
}
