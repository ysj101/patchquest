// 課題パックの定義（spec §11.1 MissionManifest）
import type { Capability, HookId, ImplementationId, ImplementationRegistry } from './runtime';
import type { ProbeDef, RequestTemplate, TestCase } from './scenario';

export const MANIFEST_SCHEMA_VERSION = 1;

/** 通常の課題か、プラットフォームの使い方を練習するオンボーディングか */
export const PACK_KINDS = ['mission', 'tutorial'] as const;
export type PackKind = (typeof PACK_KINDS)[number];

/**
 * 課題が扱う脆弱性の分類。一覧・マップ・習熟度はこの分類だけで組み立て、課題 ID で分岐しない（spec §11.3）。
 * authorization: 認可（誰のものかの照合） / output-encoding: 出力（文字として表示する） / data-access: データアクセス（値をバインドする）
 */
export const VULNERABILITY_CATEGORIES = ['authorization', 'output-encoding', 'data-access'] as const;
export type VulnerabilityCategory = (typeof VULNERABILITY_CATEGORIES)[number];

/** 課題が扱う脆弱性の種類。一覧のカードで題名より先に見せる */
export interface VulnerabilityDef {
  /** 短い通称。例: 'IDOR'、'保存型 XSS' */
  name: string;
  /** 正式な名前。例: '安全でない直接オブジェクト参照' */
  fullName: string;
  /** CWE の ID。例: 'CWE-639' */
  cwe: string;
  category: VulnerabilityCategory;
}

/** 課題の難易度。一覧はこの順（入門 → 基本 → 応用）に並べる。ロックには使わない（spec §9） */
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface MissionManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  /** 小文字・数字・ハイフン。例: 'idor' */
  id: string;
  /** 不変のパック版（x.y.z）。内容を変えたら必ず上げる */
  version: string;
  kind: PackKind;
  title: string;
  summary: string;
  learningObjectives: string[];
  estimatedMinutes: number;
  /** 扱う脆弱性。kind が mission のパックでは必須。tutorial（操作の練習）では省略し、一覧に脆弱性名を出さない */
  vulnerability?: VulnerabilityDef;
  /** 難易度。kind が mission のパックでは必須。tutorial では省略し、一覧の先頭に置く */
  difficulty?: Difficulty;
  story: StoryDef;
  /** versions は 'x.y.z'（完全一致）か '^x.y.z'（同じメジャー版で x.y.z 以上） */
  appCompatibility: { appId: string; versions: string };
  runtime: { adapter: 'browser'; capabilities: Capability[] };
  /** 必要なアプリの機能。MVP では他の課題のクリアを要求しない */
  prerequisites: { features: string[] };
  /** 交換するフックと、前提とする契約の版 */
  hooks: HookRequirement[];
  /** 同時に有効にできないパック ID */
  conflicts: string[];
  fixtures: { generator: string; variants: VariantDef[] };
  mutationRecipes: MutationRecipeDef[];
  actions: ActionDef[];
  defenses: DefenseDef[];
  probes: ProbeDef[];
  tests: {
    /** 脆弱な状態 V で失敗するはずのテスト（攻撃阻止）。アプリ共通のテスト ID も指定できる */
    target: string[];
    /** パック固有のテスト */
    cases: TestCase[];
  };
  hints: HintDef[];
  /** 解法。閲覧したことは記録に残る */
  solution: string;
  transferCheck: TransferQuestion[];
  debrief: DebriefDef;
  /** 操作ガイド。kind が tutorial のパックでは必須 */
  guide?: GuideStep[];
}

export interface StoryDef {
  /** 依頼人。導入と結果の場面で短い反応を添える（任意。無ければキャラクターなしで表示） */
  requester?: { name: string; role: string; reactions: { reproduced: string; secured: string; closing: string } };
  /** 脆弱性の仕組みだけを示す短い完成例（任意。無ければ状況タブに出さない） */
  workedExample?: WorkedExample;
  incident: string;
  goal: string;
  protectedAssets: string[];
  normalUse: string[];
}

/**
 * 仕組みを示す完成例（worked example）。初心者が攻撃を試す前に、何が起きるかを読んで理解するためのもの。
 * 対策の正解（コードや方針）は書かない。防御は学習者が対策パネルで考える
 */
export interface WorkedExample {
  title: string;
  /** 入力 → 処理 → 結果の順に、各 1〜2 文 */
  steps: string[];
  /** この例から分かること 1 文。対策には触れない */
  takeaway: string;
}

export interface HookRequirement {
  id: HookId;
  contract: number;
}

/**
 * 演習の開始条件。recipe が脆弱性の種類を決め、データの違いは演習ごとの seed で決まる。
 * データだけが違う再挑戦を新しい脆弱性として表示しない（spec §5.4）
 */
export interface VariantDef {
  id: string;
  label: string;
  recipe: string;
}

export interface ImplementationChange {
  hook: HookId;
  implementation: ImplementationId;
}

/** 検証済みの脆弱な実装を指定フックへ注入する手順（spec §5.1, §11.2） */
export interface MutationRecipeDef {
  id: string;
  version: string;
  appliesTo: { appId: string; versions: string; hooks: HookRequirement[] };
  apply: ImplementationChange[];
  /** 注入後に成立しなければならない攻撃（probe の ID） */
  verify: { probes: string[] };
  /** 元に戻すときは apply したフックを基準実装へ戻す */
  revert: 'baseline';
}

export const FIELD_INPUTS = ['text', 'textarea', 'number', 'select'] as const;

export interface FieldDef {
  name: string;
  label: string;
  input: (typeof FIELD_INPUTS)[number];
  options?: { value: string; label: string }[];
  default?: string;
  help?: string;
}

/**
 * 操作パネルの定型操作。標準の入力・選択・リクエスト編集コンポーネントで表示する。
 * request の文字列中の {{field.名前}} は入力値、{{キー}} は fixture の値に置き換わる
 */
export interface ActionDef {
  id: string;
  label: string;
  description: string;
  request: RequestTemplate;
  fields: FieldDef[];
  /** method・path・body をプレイヤーが直接編集できるか */
  editable: boolean;
}

/** 閲覧専用の参考コード差分 */
export const DIFF_LANGUAGES = ['ts', 'sql', 'html'] as const;

export interface ReferenceDiff {
  file: string;
  language: (typeof DIFF_LANGUAGES)[number];
  before: string;
  after: string;
}

/** secure: 攻撃を防ぎ正常系も通る / insufficient: 攻撃が成立したまま / breaks-normal: 正常系が壊れる */
export const DEFENSE_EXPECTATIONS = ['secure', 'insufficient', 'breaks-normal'] as const;

export interface DefenseDef {
  id: string;
  label: string;
  description: string;
  apply: ImplementationChange[];
  referenceDiff: ReferenceDiff;
  /** パック出荷前検証で確かめる期待結果。演習の採点には使わない（spec §11.2） */
  expected: (typeof DEFENSE_EXPECTATIONS)[number];
}

/** 1: 着眼点、2: 調査方法、3: 修正方針（spec §9） */
export interface HintDef {
  level: 1 | 2 | 3;
  text: string;
}

/** 演習と異なる利用者・データ・入力の状況で、原因と有効な対策を判断できるかを問う */
export interface TransferQuestion {
  id: string;
  situation: string;
  prompt: string;
  choices: { id: string; label: string; correct: boolean; explanation: string }[];
}

export interface DebriefDef {
  cause: string;
  defenseRationale: string;
  takeaways: string[];
}

/** 操作ガイドを表示する画面上の位置。コアUIはこのデータだけで表示を切り替える */
export const GUIDE_ANCHORS = [
  'mission-list',
  'preflight',
  'briefing',
  'story',
  'user-switcher',
  'app-preview',
  'actions',
  'request-editor',
  'investigation-log',
  'hints',
  'defense-panel',
  'verify',
  'results',
  'debrief',
  'reset',
  'progress-export',
] as const;
export type GuideAnchor = (typeof GUIDE_ANCHORS)[number];

/** ガイドの各ステップを完了とみなす出来事 */
export const GUIDE_MILESTONES = [
  'started',
  'briefed',
  'user-switched',
  'request-sent',
  'reproduced',
  'hint-opened',
  'defense-applied',
  'verify-failed',
  'verify-passed',
  'understood',
  'reset',
  'exported',
] as const;
export type GuideMilestone = (typeof GUIDE_MILESTONES)[number];

export interface GuideStep {
  id: string;
  title: string;
  /** 次にすることを 1〜2 文で */
  body: string;
  anchor: GuideAnchor;
  until: GuideMilestone;
  /** ステップを終えたときにかける短い言葉 */
  praise?: string;
  /** この出来事が起きたら、うまくいかなかったときの次の手を示す（例：検証で不合格だった） */
  retry?: { when: GuideMilestone; text: string };
}

/** カタログに登録する単位。実装は事前にバンドルした関数だけを持つ */
export interface MissionPack {
  manifest: MissionManifest;
  implementations: ImplementationRegistry;
}
