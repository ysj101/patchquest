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

export type BadgeKind = 'reproduction' | 'defense' | 'understanding';

export interface Badge {
  achieved: boolean;
  /** 達成の根拠になった実行 */
  runId?: string;
  /** 防御は達成時の構成ハッシュ。構成が変わったら現在の合格として表示しない */
  configHash?: string;
  at?: string;
}

/** attack: 攻撃阻止（target のテスト）、normal: 正常系、regression: 対象外のセキュリティ */
export type ResultGroup = 'attack' | 'normal' | 'regression';

export interface TestOutcome {
  testId: string;
  title: string;
  group: ResultGroup;
  passed: boolean;
  expected: string;
  actual: string;
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
  badges: Record<BadgeKind, Badge>;
  /** 直近の検証結果 */
  lastVerification: VerificationReport | null;
  hintsOpened: (1 | 2 | 3)[];
  solutionViewed: boolean;
  /** 理解確認の回答（設問 ID → 選択肢 ID） */
  answers: Record<string, string>;
}
