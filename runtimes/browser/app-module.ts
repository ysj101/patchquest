// ブラウザ用 RuntimeAdapter で動かす教材アプリの形。
// 教材ロジック（handle）は Worker、画面（render）は隔離 iframe の中で実行される
import type {
  ActorKey,
  AppDescriptor,
  AppRequest,
  AppResponse,
  HookId,
  ImplementationRegistry,
  JsonPrimitive,
  JsonValue,
  MissionPack,
  ObservedEvent,
  TestCase,
} from '../../platform/contract';
import type { Database } from './sqlite';

export type HookFunction = (...args: never[]) => unknown;

export interface ServerContext {
  db: Database;
  /** セッションから解決した利用者。未ログインや不明なセッションは null。リクエストの値からは決まらない */
  principal: ActorKey | null;
  /** フックの現在の実装 */
  hook<F extends HookFunction>(id: HookId): F;
  /** 観測イベントを記録する */
  emit(type: string, data: Record<string, JsonValue>): void;
}

export interface ViewContext {
  /** 現在の閲覧者として、教材アプリへリクエスト相当の呼び出しをする */
  request(request: AppRequest): Promise<AppResponse>;
  hook<F extends HookFunction>(id: HookId): F;
  /** アプリ内の画面遷移 */
  navigate(route: string): void;
  /** 表示用の閲覧者名。未ログインは null */
  viewer: ActorKey | null;
  /**
   * 画面で実際に起きたことを観測イベントとして記録する。
   * 教材データは文字列のまま渡し、Host の DOM へ HTML としては入れない
   */
  emit(type: string, data: Record<string, JsonValue>): void;
}

/** フックの現在の実装を解決する。初期データ生成器が、注入され得る処理（例：配備時の設定）を呼ぶのに使う */
export type HookAccessor = ServerContext['hook'];

/**
 * seed から初期データを作り、テストが {{キー}} で参照する値を返す。同じ seed なら同じデータになる。
 * hook は server のフックの現在の実装。レシピが注入した実装をここで呼べば、初期データ自体に問題を仕込める
 */
export type FixtureGenerator = (db: Database, seed: number, hook: HookAccessor) => Record<string, JsonPrimitive>;

export interface AppModule {
  descriptor: AppDescriptor;
  schema: string;
  fixtures: Record<string, FixtureGenerator>;
  /** 基準実装（server・view の両方） */
  implementations: ImplementationRegistry;
  /** アプリ共通のテスト。基準状態 S ではすべて通る。パックの tests.target から ID で参照できる */
  tests: TestCase[];
  handle(ctx: ServerContext, request: AppRequest): AppResponse;
  render(root: HTMLElement, route: string, ctx: ViewContext): Promise<void>;
  /** アプリが記録する観測イベントの説明（調査パネルで表示する）。知らない種類は null */
  describeEvent?(event: ObservedEvent): string | null;
  /** やり取りの見出しに使う、リクエストの短い表示（例：端末に打ったコマンド行）。説明しないものは null で、メソッドとパスを示す */
  describeRequest?(request: AppRequest): string | null;
}

/** 同梱する教材アプリと課題パック。テスト用ビルドではテスト専用のものに差し替わる */
export interface Catalog {
  apps: AppModule[];
  packs: MissionPack[];
}
