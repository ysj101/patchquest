// ブラウザ用 RuntimeAdapter で動かす教材アプリの形。
// 教材ロジック（handle）は Worker、画面（render）は隔離 iframe の中で実行される
import type {
  ActorKey,
  AppDescriptor,
  AppRequest,
  AppResponse,
  ExchangeDescription,
  HookId,
  ImplementationRegistry,
  JsonPrimitive,
  JsonValue,
  MissionPack,
  ObservedEvent,
  ResponseExpectation,
  TestCase,
} from '../../platform/contract';
import type { Machine } from './machine';
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
  /** 演習用の機械（本物の Linux）。machine を宣言したアプリにだけ渡る */
  machine?: Machine;
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
  /** 機械（本物の Linux）へ問い合わせるアプリは、応答を待って返せる */
  handle(ctx: ServerContext, request: AppRequest): AppResponse | Promise<AppResponse>;
  /**
   * 演習用の機械（本物の Linux を WASM のエミュレータで動かす）を使うアプリが宣言する。
   * provision は、初期データ（db）を起動直後の機械へ反映する。reset は、反映を終えた機械を初期状態へ戻す（テストごとに呼ばれる）。
   * 使うパックは runtime.capabilities に linux-vm を挙げる
   */
  machine?: { provision(machine: Machine, db: Database): Promise<void>; reset(machine: Machine): Promise<void> };
  render(root: HTMLElement, route: string, ctx: ViewContext): Promise<void>;
  /** アプリが記録する観測イベントの説明（調査パネルで表示する）。知らない種類は null */
  describeEvent?(event: ObservedEvent): string | null;
  /**
   * 観測ログの項目名（describeEvent が「名前：…」の形で出す名前）。課題パックの文章は「観測ログの「名前」」の形で、
   * ここにある名前だけを名指しできる（全パック共通のテストが確かめる）。describeEvent と同じ定数から作る
   */
  eventLabels?: readonly string[];
  /** やり取りの見出しに使う、リクエストの短い表示（例：端末に打ったコマンド行）。説明しないものは null で、メソッドとパスを示す */
  describeRequest?(request: AppRequest): string | null;
  /**
   * テストの結果での、期待する結果の短い表示（例：終了コード 0）。describeRequest が説明したリクエストにだけ使う。
   * 説明しないものは null で、リクエストの表示だけを示す
   */
  describeExpectation?(expectation: ResponseExpectation): string | null;
  /** 観測ログとテストの結果での、やり取りの結果の印と中身。説明しないものは null で、状態コードとリクエスト・応答をそのまま示す */
  describeExchange?(request: AppRequest, response: AppResponse): ExchangeDescription | null;
  /**
   * false にすると、調査タブの「リクエストを編集して送る」を出さない。
   * 端末のように、アプリの画面からどの操作でも送れて、リクエストを手で組む意味がないアプリで使う
   */
  requestEditor?: false;
}

/** 同梱する教材アプリと課題パック。テスト用ビルドではテスト専用のものに差し替わる */
export interface Catalog {
  apps: AppModule[];
  packs: MissionPack[];
}
