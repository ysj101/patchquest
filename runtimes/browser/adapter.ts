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
import { PagesFrame } from './pages/pages-host';
import { PreviewFrame, type FrameRequestHandler } from './preview-host';
import type { WorkerEnvelope, WorkerReply, WorkerRequest, WorkerResult } from './protocol';
import { checkImplementation, findApp, hookDescriptor, splitByRealm } from './registry';

export interface RuntimeLimits {
  /** 1 回の呼び出し・描画の上限（初期案: テスト 1 件 5 秒、spec §14） */
  timeoutMs: number;
  /** リクエスト 1 件の大きさの上限（初期案: 4KB） */
  maxInputBytes: number;
}

const DEFAULT_LIMITS: RuntimeLimits = { timeoutMs: 5000, maxInputBytes: 4096 };

/** 準備・リセットの上限は、1 回の呼び出しの上限の何倍か。演習用の機械（本物の Linux）は、起動と初期データの反映に時間がかかる */
const PREPARE_FACTOR = { standard: 2, machine: 6 } as const;
const prepareFactor = (app: AppModule): number => (app.machine ? PREPARE_FACTOR.machine : PREPARE_FACTOR.standard);

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

interface Prepared {
  options: PrepareOptions;
  app: AppModule;
}

/**
 * 実行環境の状態。docs/formal/Runtime.tla が、この状態と呼び出しの対応を検査する。
 * idle: まだ準備していない / ready: Worker が動いていて、教材ロジックを呼び出せる /
 * halted: 停止・時間切れ・異常終了・準備の失敗で Worker を捨てた。画面側（view）の実装の選択は残り、prepare し直すと ready に戻る /
 * disposed: 破棄した。どの操作も受け付けない
 */
type Phase =
  | { name: 'idle' }
  | { name: 'ready'; worker: Worker; prepared: Prepared }
  | { name: 'halted'; prepared: Prepared }
  | { name: 'disposed' };

const inputSize = (request: AppRequest) => new TextEncoder().encode(JSON.stringify(request)).length;

export class BrowserRuntimeAdapter implements RuntimeAdapter {
  readonly id = 'browser';
  readonly capabilities = CAPABILITIES;
  private readonly limits: RuntimeLimits;
  private readonly assetsBase: URL;
  private phase: Phase = { name: 'idle' };
  private readonly pending = new Map<number, Pending>();
  private nextCallId = 1;
  /** view で実行するフックの実装。server のフックは Worker が持つ */
  private viewSelection: ImplementationSelection = {};
  /** 発行したセッションの利用者。画面に閲覧者として表示する */
  private readonly sessionActors = new Map<SessionToken, ActorKey>();
  /** 教材アプリの画面を出す枠。画面を描くアプリは隔離 iframe、ページを返すアプリ（pages）は Service Worker が配るページを開く枠 */
  private frame: PreviewFrame | PagesFrame | undefined;
  /** 教材データの世代。用意し直す・初期状態へ戻すたびに進め、画面が前のデータのときの表示を持ち越さないようにする */
  private dataGeneration = 0;

  constructor(private readonly options: BrowserRuntimeOptions = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.assetsBase = options.assetsBase ?? new URL('./assets/', document.baseURI);
  }

  async prepare(options: PrepareOptions): Promise<FixtureData> {
    this.assertAlive();
    const app = findApp(options.app.id, options.app.version);
    const { view } = splitByRealm(app, options.implementations);
    this.frame?.detach();
    // 演習用の機械（本物の Linux）は起動直後の動きが遅いので、同じアプリを準備し直すときは Worker ごと使い回す
    // （初期データの置き直しは Worker の中で行う）。それ以外は、前の状態を残さないよう Worker を作り直す
    const reusable = this.phase.name === 'ready' && app.machine && this.phase.prepared.app === app ? this.phase.worker : undefined;
    this.phase = { name: 'ready', worker: reusable ?? this.startWorker(), prepared: { options, app } };
    this.viewSelection = view;
    this.sessionActors.clear();
    this.dataGeneration += 1;
    try {
      return (await this.call({ op: 'prepare', options }, `prepare:${options.attemptId}`, this.limits.timeoutMs * prepareFactor(app))) as FixtureData;
    } catch (error) {
      // 準備に失敗した Worker は使い回さない（途中まで進んだ状態や、読めなかった配布物を次の準備へ持ち越さない）
      this.halt('stopped');
      throw error;
    }
  }

  async start(): Promise<void> {
    this.assertAlive();
    const prepared = this.phase.name === 'ready' || this.phase.name === 'halted' ? this.phase.prepared : undefined;
    this.frameFor(prepared?.app);
  }

  /**
   * アプリに合う枠を返す。画面を描くアプリは隔離 iframe、ページを返すアプリ（pages）は Service Worker が配るページを開く枠。
   * 前に準備したアプリと種類が違うときは、枠を作り直す。準備の前（アプリがまだない）は隔離 iframe にする
   */
  private frameFor(app: AppModule | undefined): PreviewFrame | PagesFrame {
    const kind = app?.pages ? 'pages' : 'preview';
    if (this.frame?.kind === kind) return this.frame;
    this.frame?.dispose();
    const container = this.options.container ?? null;
    const forward: FrameRequestHandler = (request, session, runId) => this.forwardFromFrame(request, session, runId);
    this.frame =
      kind === 'pages'
        ? new PagesFrame(this.assetsBase, container, forward, this.options.onExchange)
        : new PreviewFrame(new URL('preview.html', this.assetsBase), container, forward, this.options.onExchange);
    return this.frame;
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
    const { app } = this.requirePrepared();
    this.frame?.detach();
    this.sessionActors.clear();
    this.dataGeneration += 1;
    return (await this.call({ op: 'reset' }, 'reset', this.limits.timeoutMs * prepareFactor(app))) as FixtureData;
  }

  async stop(): Promise<void> {
    this.halt('stopped');
    this.frame?.detach();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.frame?.dispose();
    this.frame = undefined;
    this.phase = { name: 'disposed' };
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
    const events = await this.frameFor(app).render({
      runId,
      appId: app.descriptor.id,
      route,
      viewer,
      session,
      implementations: this.viewSelection,
      dataGeneration: this.dataGeneration,
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
    if (this.phase.name !== 'ready') return Promise.reject(new RuntimeError('not-prepared', '実行環境が準備されていません'));
    const { worker, prepared } = this.phase;
    const callId = this.nextCallId++;
    const { attemptId } = prepared.options;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 実行中の WASM は外から中断できないため、Worker ごと破棄する。続けるには prepare し直す
        this.pending.delete(callId);
        this.halt('stopped');
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

  /** 動いている Worker を捨て（前の状態を残さない）、新しい Worker を起動する */
  private startWorker(): Worker {
    this.halt('stopped');
    const worker = new Worker(new URL('runtime-worker.js', this.assetsBase), { type: 'module', name: 'patchquest-runtime' });
    worker.addEventListener('message', (e: MessageEvent<WorkerReply>) => this.receive(e.data));
    worker.addEventListener('error', () => this.halt('crashed'));
    return worker;
  }

  /** Worker を捨てて halted にし、応答を待っている呼び出しを code で失敗させる。Worker が動いていなければ状態は変えない */
  private halt(code: 'stopped' | 'crashed'): void {
    if (this.phase.name === 'ready') {
      this.phase.worker.terminate();
      this.phase = { name: 'halted', prepared: this.phase.prepared };
    }
    for (const pending of this.pending.values()) pending.reject(new RuntimeError(code, code === 'stopped' ? '停止しました' : '実行環境が異常終了しました'));
    this.pending.clear();
  }

  private requirePrepared(): Prepared {
    this.assertAlive();
    if (this.phase.name !== 'ready' && this.phase.name !== 'halted') throw new RuntimeError('not-prepared', '実行環境が準備されていません');
    return this.phase.prepared;
  }

  private assertAlive(): void {
    if (this.phase.name === 'disposed') throw new RuntimeError('disposed', '実行環境は破棄されています');
  }
}
