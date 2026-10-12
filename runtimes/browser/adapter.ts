// ブラウザ用 RuntimeAdapter（spec §11.2, §14）。教材ロジックと SQLite は Worker、画面は隔離 iframe で動かす
import {
  ANONYMOUS,
  CAPABILITIES,
  RuntimeError,
  type ActorKey,
  type AppRequest,
  type Exchange,
  type FixtureData,
  type HookId,
  type ImplementationId,
  type ImplementationSelection,
  type InvokeCall,
  type InvokeOptions,
  type InvokeResult,
  type PrepareOptions,
  type RuntimeAdapter,
  type SessionToken,
} from '../../platform/contract';
import type { AppModule } from './app-module';
import { PreviewFrame } from './preview-host';
import type { WorkerEnvelope, WorkerReply, WorkerRequest, WorkerResult } from './protocol';
import { checkImplementation, findApp, hookDescriptor, splitByRealm } from './registry';

export interface RuntimeLimits {
  /** 1 回の呼び出し・描画の上限（初期案: テスト 1 件 5 秒、spec §14） */
  timeoutMs: number;
  /** リクエスト 1 件の大きさの上限（初期案: 4KB） */
  maxInputBytes: number;
}

export const DEFAULT_LIMITS: RuntimeLimits = { timeoutMs: 5000, maxInputBytes: 4096 };

/** 検証の描画では、画像のエラーなど描画後に非同期で起きる事象も集めるため少し待つ */
const RENDER_SETTLE_MS = 150;

export interface BrowserRuntimeOptions {
  /** 画面を表示する要素。省略すると非表示のプレビューを使う（検証用インスタンス） */
  container?: HTMLElement;
  /** runtime-worker.js と preview.html を置いたディレクトリ。既定は ./assets/ */
  assetsBase?: URL;
  limits?: Partial<RuntimeLimits>;
  /** プレビュー内の操作で観測したやり取りの通知 */
  onExchange?: (exchange: Exchange) => void;
}

interface Pending {
  attemptId: string;
  runId: string;
  resolve: (result: WorkerResult) => void;
  reject: (error: RuntimeError) => void;
}

const inputSize = (request: AppRequest) => new TextEncoder().encode(JSON.stringify(request)).length;

export class BrowserRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'browser';
  readonly capabilities = CAPABILITIES;
  private readonly limits: RuntimeLimits;
  private readonly assetsBase: URL;
  private worker: Worker | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextCallId = 1;
  private prepared: { options: PrepareOptions; app: AppModule } | undefined;
  /** view で実行するフックの実装。server のフックは Worker が持つ */
  private viewSelection: ImplementationSelection = {};
  /** 発行したセッションの利用者。画面に閲覧者として表示する */
  private readonly sessionActors = new Map<SessionToken, ActorKey>();
  private frame: PreviewFrame | undefined;
  private disposed = false;

  constructor(private readonly options: BrowserRuntimeOptions = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.assetsBase = options.assetsBase ?? new URL('./assets/', document.baseURI);
  }

  async prepare(options: PrepareOptions): Promise<FixtureData> {
    this.assertAlive();
    const app = findApp(options.app.id, options.app.version);
    const { view } = splitByRealm(app, options.implementations);
    this.terminateWorker('stopped');
    this.frame?.detach();
    this.worker = new Worker(new URL('runtime-worker.js', this.assetsBase), { type: 'module', name: 'patchquest-runtime' });
    this.worker.addEventListener('message', (e: MessageEvent<WorkerReply>) => this.receive(e.data));
    this.worker.addEventListener('error', () => this.terminateWorker('crashed'));
    this.prepared = { options, app };
    this.viewSelection = view;
    this.sessionActors.clear();
    return (await this.call({ op: 'prepare', options }, `prepare:${options.attemptId}`, this.limits.timeoutMs * 2)) as FixtureData;
  }

  async start(): Promise<void> {
    this.assertAlive();
    this.frame ??= new PreviewFrame(
      new URL('preview.html', this.assetsBase),
      this.options.container ?? null,
      (request, session, runId) => this.forwardFromFrame(request, session, runId),
      this.options.onExchange,
    );
  }

  async invoke(call: InvokeCall, options: InvokeOptions): Promise<InvokeResult> {
    const timeoutMs = options.timeoutMs ?? this.limits.timeoutMs;
    if (call.kind === 'render') return this.render(call.view.route, call.session, options.runId, timeoutMs, RENDER_SETTLE_MS);
    if (call.kind === 'request' && inputSize(call.request) > this.limits.maxInputBytes) {
      throw new RuntimeError('input-too-large', `入力が上限（${this.limits.maxInputBytes} バイト）を超えています`);
    }
    const result = (await this.call({ op: 'invoke', call }, options.runId, timeoutMs)) as InvokeResult;
    if (call.kind === 'session' && result.session) this.sessionActors.set(result.session, call.actor);
    return result;
  }

  /**
   * プレビューに表示する閲覧者と画面を切り替える。セッションは信頼された演習ハーネスとして発行する。
   * 以前の runId のメッセージはこれ以降破棄される
   */
  async showView(actor: ActorKey, route: string, runId: string): Promise<void> {
    const { session } = await this.invoke({ kind: 'session', actor }, { runId });
    await this.render(route, session ?? null, runId, this.limits.timeoutMs, 0);
  }

  async setImplementation(hook: HookId, implementation: ImplementationId): Promise<void> {
    const { app } = this.requirePrepared();
    if (hookDescriptor(app, hook).realm === 'view') {
      checkImplementation(app, hook, implementation, 'view');
      this.viewSelection = { ...this.viewSelection, [hook]: implementation };
      return;
    }
    await this.call({ op: 'setImplementation', hook, implementation }, `implementation:${hook}`, this.limits.timeoutMs);
  }

  async reset(): Promise<FixtureData> {
    this.requirePrepared();
    this.frame?.detach();
    this.sessionActors.clear();
    return (await this.call({ op: 'reset' }, 'reset', this.limits.timeoutMs * 2)) as FixtureData;
  }

  async stop(): Promise<void> {
    this.terminateWorker('stopped');
    this.frame?.detach();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.frame?.dispose();
    this.frame = undefined;
    this.prepared = undefined;
    this.disposed = true;
  }

  /** 照合に失敗して破棄したプレビューからのメッセージの件数（検証用） */
  get rejectedFrameMessages(): number {
    return this.frame?.rejected ?? 0;
  }

  private async render(route: string, session: SessionToken | null, runId: string, timeoutMs: number, settleMs: number): Promise<InvokeResult> {
    const { app } = this.requirePrepared();
    if (!this.frame) throw new RuntimeError('not-prepared', 'プレビューが開始されていません');
    const started = performance.now();
    const viewer = (session && this.sessionActors.get(session)) ?? ANONYMOUS;
    const events = await this.frame.render({
      runId,
      appId: app.descriptor.id,
      route,
      viewer,
      session,
      implementations: this.viewSelection,
      timeoutMs,
      settleMs,
    });
    return { events, elapsedMs: performance.now() - started };
  }

  private async forwardFromFrame(request: AppRequest, session: SessionToken | null, runId: string) {
    const { response, events } = await this.invoke({ kind: 'request', session, request }, { runId });
    return { response: response!, events };
  }

  private call(request: WorkerRequest, runId: string, timeoutMs: number): Promise<WorkerResult> {
    const worker = this.worker;
    const prepared = this.prepared;
    if (!worker || !prepared) return Promise.reject(new RuntimeError('not-prepared', '実行環境が準備されていません'));
    const callId = this.nextCallId++;
    const { attemptId } = prepared.options;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 実行中の WASM は外から中断できないため、Worker ごと破棄する。続けるには prepare し直す
        this.pending.delete(callId);
        this.terminateWorker('stopped');
        reject(new RuntimeError('timeout', `${timeoutMs}ms 以内に終わりませんでした`));
      }, timeoutMs);
      this.pending.set(callId, {
        attemptId,
        runId,
        resolve: (result) => (clearTimeout(timer), resolve(result)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      const envelope: WorkerEnvelope = { callId, attemptId, runId, request };
      worker.postMessage(envelope);
    });
  }

  private receive(reply: WorkerReply): void {
    const pending = this.pending.get(reply.callId);
    // 呼び出しと attemptId・runId が一致しない応答（古い実行の応答など）は破棄する
    if (!pending || pending.attemptId !== reply.attemptId || pending.runId !== reply.runId) return;
    this.pending.delete(reply.callId);
    if (reply.ok) pending.resolve(reply.result);
    else pending.reject(new RuntimeError(reply.error.code, reply.error.message));
  }

  private terminateWorker(code: 'stopped' | 'crashed'): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) pending.reject(new RuntimeError(code, code === 'stopped' ? '停止しました' : '実行環境が異常終了しました'));
    this.pending.clear();
  }

  private requirePrepared(): { options: PrepareOptions; app: AppModule } {
    this.assertAlive();
    if (!this.prepared) throw new RuntimeError('not-prepared', '実行環境が準備されていません');
    return this.prepared;
  }

  private assertAlive(): void {
    if (this.disposed) throw new RuntimeError('disposed', '実行環境は破棄されています');
  }
}
