// 画面に出す名前。利用者が操作・認識するものの名前で書く
import type { BadgeKind, Difficulty, ExerciseState, ResultGroup, VulnerabilityCategory } from '../contract';
import type { PreflightStep } from '../orchestrator/orchestrator';

export const STATE_LABEL: Record<ExerciseState, string> = {
  Selected: '準備中',
  Preflight: '開始前チェック中',
  Prepared: '調査を始められます',
  Explored: '調査中',
  Repairing: '対策中',
  Verifying: 'テスト中',
  Passed: '解決',
  Blocked: '開始できません',
};

export const STEP_LABEL: Record<PreflightStep, string> = {
  compatibility: '教材アプリと課題が合っているか',
  baseline: '安全な状態でテストが通るか',
  inject: '弱点を入れると、攻撃が通るか',
  prepare: '演習の準備',
};

export const BADGE_LABEL: Record<BadgeKind, string> = {
  reproduction: '再現',
  defense: '防御',
  understanding: '理解',
};

export const BADGE_HINT: Record<BadgeKind, string> = {
  reproduction: '自分の操作で問題を再現した',
  defense: '対策して攻撃を止め、ふだんの使い方もできた',
  understanding: '別の場面でも、原因と対策を選べた',
};

export const GROUP_LABEL: Record<ResultGroup, string> = {
  attack: '攻撃を防げたか',
  normal: 'ふだんの使い方ができるか',
  regression: 'ほかの守りが壊れていないか',
};

/** 脆弱性の分類の表示名。一覧と習熟度で共用する */
export const VULNERABILITY_CATEGORY_LABEL: Record<VulnerabilityCategory, string> = {
  authorization: '持ち主の確認',
  'output-encoding': '画面への表示',
  'data-access': 'データの取り出し',
  misconfiguration: '設定',
};

/** 分類の一言説明。初めての人が分類名だけで意味を取れないときの手がかり */
export const VULNERABILITY_CATEGORY_NOTE: Record<VulnerabilityCategory, string> = {
  authorization: '「このデータは誰のものか」を確かめる仕組みの問題',
  'output-encoding': '受け取った文字を画面に出すときの扱いの問題',
  'data-access': 'データベースへの問い合わせの組み立て方の問題',
  misconfiguration: '権限や公開範囲の設定が、必要以上に広くなっている問題',
};

/** CWE が何かの説明。略語を初回の説明なしに出さないために、CWE の番号には必ず添える */
export const CWE_NOTE = 'ソフトウェアの弱点に、共通の番号をつけた一覧です（Common Weakness Enumeration）。あとで調べるときに役立ちます';

export const HINT_LABEL = { 1: '見るところ', 2: '調べ方', 3: '直し方' } as const;

export const BLOCKED_LABEL = {
  incompatible: '開始できません',
  'injection-failed': '開始できません',
  'platform-error': 'システムのエラー',
} as const;

/** 検証結果パネルとコールアウトで共用する総評。 */
export const VERDICT_REASON: Record<ResultGroup, string> = {
  attack: '攻撃をまだ防げていません',
  normal: 'ふだんの使い方が壊れています',
  regression: 'ほかの守りが壊れています',
};

export const VERDICT_TITLE = {
  secured: '防御できました',
  insufficient: 'まだ合格ではありません',
} as const;

export const VERDICT_SUCCESS = '攻撃を止められて、ふだんの使い方もそのままできます。';

/** 構成変更後の検証結果を現在の合格と誤認させないための警告。 */
export const STALE_VERIFICATION = '対策を変えたので、これは前の結果です。もう一度テストしてください。';

/** 習熟度の段階の名前。★の数だけに頼らず文字でも示す（0〜5） */
export const MASTERY_LEVEL_LABEL: readonly string[] = ['未着手', '再現まで', '防御まで', '理解まで', '別の条件でも達成', '別の条件でくり返し達成'];
export const MASTERY_NOTE = '習熟度は、保存されたスタンプから計算します。';
export const MASTERY_NOTE_MORE = '同じ条件の繰り返しでは上がりません。';

export const PROFILE_RECOMPUTED = '読み込んだファイルの XP や実績が記録と合わなかったので、記録から計算し直しました';

/** 難易度の表示名。一覧はこの順に並べる */
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: '入門',
  intermediate: '基本',
  advanced: '応用',
};
