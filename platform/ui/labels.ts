// 画面に出す名前。利用者が操作・認識するものの名前で書く
import type { BadgeKind, ExerciseState, ResultGroup } from '../contract';
import type { PreflightStep } from '../orchestrator/orchestrator';

export const STATE_LABEL: Record<ExerciseState, string> = {
  Selected: '準備中',
  Preflight: '開始前チェック中',
  Prepared: '調査を始められます',
  Explored: '調査中',
  Repairing: '修正中',
  Verifying: '検証中',
  Passed: '解決',
  Blocked: '開始できません',
};

export const STEP_LABEL: Record<PreflightStep, string> = {
  compatibility: '教材アプリと課題の互換性',
  baseline: '安全な状態でのテスト',
  inject: '脆弱性の注入と、攻撃が成立すること',
  prepare: '演習環境の用意',
};

export const BADGE_LABEL: Record<BadgeKind, string> = {
  reproduction: '再現',
  defense: '防御',
  understanding: '理解',
};

export const BADGE_HINT: Record<BadgeKind, string> = {
  reproduction: '自分の操作で事故を再現した',
  defense: '対策後に攻撃を防ぎ、正常な利用も通った',
  understanding: '別の状況でも原因と対策を判断できた',
};

export const GROUP_LABEL: Record<ResultGroup, string> = {
  attack: '攻撃を防げたか',
  normal: '正常な利用ができるか',
  regression: 'ほかの守りが壊れていないか',
};

export const HINT_LABEL = { 1: '着眼点', 2: '調査方法', 3: '修正方針' } as const;

export const BLOCKED_LABEL = {
  incompatible: '開始できません',
  'injection-failed': '開始できません',
  'platform-error': '実行環境のエラー',
} as const;

/** 検証結果パネルとコールアウトで共用する総評。 */
export const VERDICT_REASON: Record<ResultGroup, string> = {
  attack: '攻撃をまだ防げていません',
  normal: '普段の使い方が壊れています',
  regression: 'ほかの守りが壊れています',
};

export const VERDICT_TITLE = {
  secured: '防御できました',
  insufficient: 'まだ合格ではありません',
} as const;

export const VERDICT_SUCCESS = '攻撃を防ぎ、普段の使い方も通りました。';

/** 構成変更後の検証結果を現在の合格と誤認させないための警告。 */
export const STALE_VERIFICATION = '対策を変えたため、この結果はいまの構成のものではありません。もう一度検証してください。';

export const XP_NOTE = 'XP は取り組みへの報酬です。理解度や達成印の判定は変わりません';
export const PROFILE_RECOMPUTED = '取り込んだファイルの XP または実績は、そのファイルの記録と合わなかったため、記録から計算し直しました';
