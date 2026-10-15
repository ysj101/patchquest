// 演習進行の共有型と、教材アプリとの互換性判定。
import { satisfies, validatePack, type AppDescriptor, type AttemptRecord,
  type ImplementationRegistry, type ImplementationSelection, type MissionPack, type RuntimeAdapter,
  type TestCase, type VerificationReport } from '../contract';
import type { Evaluator } from '../evaluator/evaluator';
import type { Scope } from '../evaluator/scenario';

/** カタログに登録された教材アプリのうち、進行に必要な部分 */
export interface CatalogApp {
  descriptor: AppDescriptor;
  tests: TestCase[];
  implementations: ImplementationRegistry;
}

/** パックが対応する版の教材アプリ */
export function compatibleApp<A extends CatalogApp>(apps: readonly A[], pack: MissionPack): A | undefined {
  const { appId, versions } = pack.manifest.appCompatibility;
  return apps.find((app) => app.descriptor.id === appId && satisfies(app.descriptor.version, versions));
}

/** パックを教材アプリの契約（フック・機能・利用者・共通テスト・基準実装）に照らして検証する */
export function validateForApp(pack: MissionPack, app: CatalogApp): string[] {
  return validatePack(pack, { app: app.descriptor, appTestIds: app.tests.map((test) => test.id), sharedImplementations: app.implementations });
}

export type PreflightStep = 'compatibility' | 'baseline' | 'inject' | 'prepare';

export interface PreflightEntry {
  step: PreflightStep;
  status: 'running' | 'passed' | 'failed';
  detail: string;
}

/** 開始できない理由。incompatible・injection-failed は開始不可、platform-error は基盤エラー（いずれも不合格に数えない） */
export interface BlockedReason {
  kind: 'incompatible' | 'injection-failed' | 'platform-error';
  message: string;
}

export interface ExerciseSnapshot {
  attempt: AttemptRecord;
  pack: MissionPack;
  /** fixture の値。操作の {{キー}} を展開するのに使う */
  refs: Scope;
  implementations: ImplementationSelection;
  preflight: PreflightEntry[];
  blocked: BlockedReason | null;
  /** 直近の検証で起きた基盤エラー */
  platformError: string | null;
  /**
   * 防御の達成印が、この演習で現在の構成を検証して得たものか。
   * 記録から続きを始めた場合は、再検証するまで現在の合格として扱わない（spec §13）
   */
  defenseCurrent: boolean;
  /** 修正前（注入後の脆弱な状態）を実測した結果。再開時に事前検証で再生成し、永続化しない。 */
  vulnerableVerification: VerificationReport | null;
}

export interface OrchestratorDeps {
  apps: CatalogApp[];
  packs: MissionPack[];
  evaluator: Evaluator;
  /** 演習用インスタンス。プレイヤーが操作する画面を持つ */
  exercise: RuntimeAdapter;
  randomSeed?: () => number;
  newId?: () => string;
  now?: () => Date;
}

export class Blocked extends Error {
  constructor(readonly reason: BlockedReason) {
    super(reason.message);
  }
}

export interface Current {
  snapshot: ExerciseSnapshot;
  /** 対応する教材アプリ。見つからなければ互換性の確認で開始不可にする */
  app: CatalogApp | undefined;
  tests: TestCase[];
  /** 注入後の状態 V の実装 */
  vulnerable: ImplementationSelection;
  /** パックが交換するフックの基準実装 */
  baseline: ImplementationSelection;
  /** この演習で発行した実行 ID。これ以外のやり取り（古い演習の応答など）は無視する */
  runIds: Set<string>;
}
