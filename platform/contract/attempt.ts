// 演習の状態と記録（spec §5.3, §13）

/**
 * Selected: 課題を選んだ / Preflight: 互換性確認・注入・事前検証中 / Prepared: 脆弱な初期状態で開始できる /
 * Explored: 調査・再現中 / Repairing: 対策を選んでいる / Verifying: 検証中 / Passed: 再現・防御・理解をすべて達成 /
 * Blocked: 開始不可または基盤エラー（学習上の不合格には数えない）
 */
export type ExerciseState = 'Selected' | 'Preflight' | 'Prepared' | 'Explored' | 'Repairing' | 'Verifying' | 'Passed' | 'Blocked';

/** 許可する状態遷移。Prepared へ戻る遷移は「初期状態へ戻す」 */
export const TRANSITIONS: Readonly<Record<ExerciseState, readonly ExerciseState[]>> = {
  Selected: ['Preflight'],
  Preflight: ['Prepared', 'Blocked'],
  Prepared: ['Explored', 'Repairing', 'Blocked'],
  Explored: ['Repairing', 'Prepared', 'Blocked'],
  Repairing: ['Verifying', 'Prepared', 'Passed', 'Blocked'],
  Verifying: ['Repairing', 'Passed', 'Blocked'],
  Passed: ['Repairing', 'Prepared', 'Blocked'],
  Blocked: ['Preflight'],
};

export function canTransition(from: ExerciseState, to: ExerciseState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 演習中（開始後で、対策を選べる状態）か。遷移表から導く */
export function isInExercise(state: ExerciseState): boolean {
  return state === 'Repairing' || canTransition(state, 'Repairing');
}

export const BADGE_KINDS = ['reproduction', 'defense', 'understanding'] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export interface Badge {
  achieved: boolean;
  /** 達成の根拠になった実行 */
  runId?: string;
  /** 防御は達成時の構成ハッシュ。構成が変わったら現在の合格として表示しない */
  configHash?: string;
  at?: string;
}

/** attack: 攻撃阻止（target のテスト）、normal: 正常系、regression: 対象外のセキュリティ */
export const RESULT_GROUPS = ['attack', 'normal', 'regression'] as const;
export type ResultGroup = (typeof RESULT_GROUPS)[number];

export interface TestOutcome {
  testId: string;
  title: string;
  group: ResultGroup;
  passed: boolean;
  expected: string;
  actual: string;
  /** 基盤エラー（タイムアウトなど）で判定できなかった。学習上の不合格には数えない */
  error?: string;
}

export interface VerificationReport {
  runId: string;
  attemptId: string;
  configHash: string;
  outcomes: TestOutcome[];
  /** すべての outcome が合格したか */
  passed: boolean;
  startedAt: string;
  elapsedMs: number;
}

/** 改善履歴の保存上限。長い演習でも記録容量を増やし続けない。 */
export const MAX_HISTORY = 100;

/** 検証の実測件数。判定不能の outcome は groups の分母・分子に含めない。 */
export interface VerificationEntry {
  runId: string;
  at: string;
  defenseId: string | null;
  passed: boolean;
  undetermined: number;
  groups: Record<ResultGroup, { passed: number; total: number }>;
}

/** 演習 1 回分の記録。開始時に版・seed を固定する（spec §5.3） */
export interface AttemptRecord {
  attemptId: string;
  missionId: string;
  missionVersion: string;
  variantId: string;
  recipeId: string;
  recipeVersion: string;
  appId: string;
  appVersion: string;
  seed: number;
  fixtureHash: string;
  createdAt: string;
  state: ExerciseState;
  /** 現在の対策構成のハッシュ */
  configHash: string;
  appliedDefense: string | null;
  /** 初回の到達時刻。対策の取り消しやリセットでも保持する */
  milestones: { briefedAt: string | null; firstRequestAt: string | null; firstDefenseAt: string | null };
  badges: Record<BadgeKind, Badge>;
  /** 直近の検証結果 */
  lastVerification: VerificationReport | null;
  /** 検証のたびに追加。対策の取り消しやリセットでも消さない。
   * 検証順（時刻順）に末尾へ追加し、この順序を保持する。 */
  history: VerificationEntry[];
  hintsOpened: (1 | 2 | 3)[];
  solutionViewed: boolean;
  /** 理解確認の回答（設問 ID → 選択肢 ID） */
  answers: Record<string, string>;
}

/** 未到達の時刻を持つ、演習ごとに独立した記録を作る。 */
export function emptyMilestones(): AttemptRecord['milestones'] {
  return { briefedAt: null, firstRequestAt: null, firstDefenseAt: null };
}

/** 新しい演習の操作記録と達成印。呼ぶたびに独立した入れ物を作る。 */
export function initialAttemptProgress() {
  return {
    appliedDefense: null,
    milestones: emptyMilestones(),
    badges: { reproduction: { achieved: false }, defense: { achieved: false }, understanding: { achieved: false } },
    lastVerification: null,
    history: [] as VerificationEntry[],
    hintsOpened: [],
    solutionViewed: false,
    answers: {},
  } satisfies Pick<AttemptRecord, 'appliedDefense' | 'milestones' | 'badges' | 'lastVerification' | 'history' | 'hintsOpened' | 'solutionViewed' | 'answers'>;
}
