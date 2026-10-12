// プラットフォームと実行環境（RuntimeAdapter）の契約（spec §11.2）
import type { JsonPrimitive, JsonValue } from './json';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
/** 交換点の ID。例: 'memo.read.authorize' */
export type HookId = string;
/** 実装の ID。パック内で一意になるよう、パック ID を接頭辞に付ける。例: 'idor/no-owner-check' */
export type ImplementationId = string;
/** fixture の利用者キー（例: 'alice'）。未ログインは ANONYMOUS */
export type ActorKey = string;
export type SessionToken = string;

export const ANONYMOUS: ActorKey = 'anonymous';

/** 実行環境が提供する機能。パックは必要な機能を宣言する */
export const CAPABILITIES = ['sqlite', 'dom-preview'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** server は Worker 内の教材ロジック、view は隔離 iframe 内の表示で実行される */
export type HookRealm = 'server' | 'view';

/** 教材アプリが公開する交換点 */
export interface HookDescriptor {
  id: HookId;
  realm: HookRealm;
  /** 入出力契約の版。パックは同じ版のフックだけを交換できる */
  contract: number;
  /** 安全な基準状態 S の実装 */
  baseline: ImplementationId;
  description: string;
}

export interface AppDescriptor {
  id: string;
  version: string;
  features: string[];
  hooks: HookDescriptor[];
  /** fixture の利用者キー */
  users: ActorKey[];
}

/** フックごとに選んだ実装。指定のないフックは基準実装を使う */
export type ImplementationSelection = Record<HookId, ImplementationId>;

/**
 * 交換できる実装。パックとアプリが事前にバンドルした関数だけを登録でき、
 * 任意のソースコード文字列を実行する経路は持たない（spec §11.2）
 */
export interface ImplementationEntry {
  hook: HookId;
  run: (...args: never[]) => unknown;
}
export type ImplementationRegistry = Record<ImplementationId, ImplementationEntry>;

/** ブラウザ内の「リクエスト相当の呼び出し」。本物のネットワーク通信ではない */
export interface AppRequest {
  method: HttpMethod;
  path: string;
  body?: JsonValue;
}

export interface AppResponse {
  status: number;
  body: JsonValue;
}

/** 計測した事象。type はアプリとフックが定義する（例: 'sql.query', 'authz.decision', 'dom.marker'） */
export interface ObservedEvent {
  type: string;
  data: Record<string, JsonValue>;
}

/** 描画する画面。route はアプリが定義する（例: '/memos'） */
export interface ViewTarget {
  route: string;
}

export type InvokeCall =
  /** 信頼された演習ハーネスが利用者のセッションを発行する。教材アプリへのリクエストからは発行できない */
  | { kind: 'session'; actor: ActorKey }
  | { kind: 'request'; session: SessionToken | null; request: AppRequest }
  | { kind: 'render'; session: SessionToken | null; view: ViewTarget };

export interface InvokeOptions {
  /** 実行ごとの ID。結果と観測イベントはこの ID に結び付き、古い実行の応答は破棄される */
  runId: string;
  timeoutMs?: number;
}

export interface InvokeResult {
  /** kind: 'request' の応答 */
  response?: AppResponse;
  /** kind: 'session' で発行したセッション。ANONYMOUS なら null */
  session?: SessionToken | null;
  events: ObservedEvent[];
  elapsedMs: number;
}

/** 観測した 1 回のやり取り。プレビュー内の操作や調査パネルからの呼び出しを記録し、再現の判定に使う */
export interface Exchange {
  runId: string;
  /** 呼び出したときの利用者。未ログインは ANONYMOUS */
  actor: ActorKey;
  kind: 'request' | 'render';
  request?: AppRequest;
  response?: AppResponse;
  /** kind: 'render' の画面 */
  route?: string;
  events: ObservedEvent[];
}

export interface PrepareOptions {
  attemptId: string;
  app: { id: string; version: string };
  fixture: { generator: string; seed: number };
  implementations: ImplementationSelection;
}

/** 初期データ。refs はテストやヒントが {{キー}} で参照する値（例: 'memos.alice.private.id'） */
export interface FixtureData {
  refs: Record<string, JsonPrimitive>;
  /** 初期データ全体のハッシュ。同じ seed なら同じ値になる */
  hash: string;
}

export type RuntimeErrorCode =
  | 'timeout'
  | 'stopped'
  | 'disposed'
  | 'not-prepared'
  | 'unknown-app'
  | 'unknown-implementation'
  | 'input-too-large'
  | 'crashed';

/** 基盤側の失敗。学習上の不合格には数えない（spec §13） */
export class RuntimeError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
}

/**
 * 教材アプリの起動・操作・実装切替・観測・破棄を担う。
 * 失敗は RuntimeError で通知する。教材アプリ内の例外は応答（status 500 など）として返す
 */
export interface RuntimeAdapter {
  readonly id: string;
  readonly capabilities: readonly Capability[];
  /** 実行環境を用意し、fixture と seed から初期データを作る */
  prepare(options: PrepareOptions): Promise<FixtureData>;
  /** 画面（view）を含めて操作できる状態にする */
  start(): Promise<void>;
  invoke(call: InvokeCall, options: InvokeOptions): Promise<InvokeResult>;
  /** 許可された実装 ID だけを受け付け、フック単位で切り替える */
  setImplementation(hook: HookId, implementation: ImplementationId): Promise<void>;
  /** 実装の選択を保ったまま、同じ fixture と seed で初期データを作り直す */
  reset(): Promise<FixtureData>;
  /** 実行中の処理を止める。再び prepare できる */
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
