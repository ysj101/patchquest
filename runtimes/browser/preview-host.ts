// 隔離 iframe（プレビュー）の Host 側。メッセージは送信元ウィンドウ・スキーマ・実行 ID で照合する（spec §14）
import {
  HTTP_METHODS,
  RuntimeError,
  errorMessage,
  isObj,
  type ActorKey,
  type AppRequest,
  type AppResponse,
  type Exchange,
  type ImplementationSelection,
  type ObservedEvent,
  type SessionToken,
} from '../../platform/contract';
import type { FromFrame, ToFrame } from './protocol';

const MAX_PATH_LENGTH = 2048;


/** 枠や Service Worker から届いた値が、教材アプリへのリクエストの形をしているか */
export function isRequest(v: unknown): v is AppRequest {
  return (
    isObj(v) &&
    (HTTP_METHODS as readonly unknown[]).includes(v.method) &&
    typeof v.path === 'string' &&
    v.path.startsWith('/') &&
    v.path.length <= MAX_PATH_LENGTH
  );
}

function parseFromFrame(data: unknown): FromFrame | null {
  if (!isObj(data) || typeof data.type !== 'string') return null;
  if (data.type === 'ready') return { type: 'ready' };
  if (typeof data.runId !== 'string') return null;
  switch (data.type) {
    case 'request':
      return Number.isInteger(data.requestId) && isRequest(data.request) ? (data as FromFrame) : null;
    case 'event':
      return isObj(data.event) && typeof data.event.type === 'string' && isObj(data.event.data) ? (data as FromFrame) : null;
    case 'rendered':
      return typeof data.route === 'string' ? (data as FromFrame) : null;
    case 'error':
      return typeof data.message === 'string' ? (data as FromFrame) : null;
    default:
      return null;
  }
}

/** プレビュー内の呼び出しを、閲覧者のセッションで教材ロジックへ渡す */
export type FrameRequestHandler = (
  request: AppRequest,
  session: SessionToken | null,
  runId: string,
) => Promise<{ response: AppResponse; events: ObservedEvent[] }>;

export interface RenderParams {
  runId: string;
  appId: string;
  route: string;
  viewer: ActorKey;
  session: SessionToken | null;
  implementations: ImplementationSelection;
  /** 教材データの世代（ViewContext.dataGeneration として画面へ渡す） */
  dataGeneration: number;
  timeoutMs: number;
  /** 描画完了の通知から結果を返すまで待つ時間 */
  settleMs: number;
}

interface FrameContext {
  runId: string;
  viewer: ActorKey;
  session: SessionToken | null;
  route: string;
}

interface Collector {
  events: ObservedEvent[];
  rendered: (route: string) => void;
  failed: (message: string) => void;
}

/** 教材アプリの枠を、題名を付けて置き、枠からのメッセージを聞く。container がなければ見えない枠にする（検証用インスタンス） */
export function mountFrame(element: HTMLIFrameElement, container: HTMLElement | null, onMessage: (message: MessageEvent) => void): void {
  element.title = '教材アプリ（学習用に脆弱性を注入した架空サービス）';
  if (!container) element.hidden = true;
  window.addEventListener('message', onMessage);
  (container ?? document.body).append(element);
}

/** 枠を片づけ、メッセージを聞くのをやめる */
export function unmountFrame(element: HTMLIFrameElement, onMessage: (message: MessageEvent) => void): void {
  window.removeEventListener('message', onMessage);
  element.remove();
}

/** 枠の中からのリクエストを、閲覧者のセッションで教材ロジックへ渡す。基盤側の失敗は、503 の応答にして枠へ返す */
export async function forwardRequest(
  handle: FrameRequestHandler,
  request: AppRequest,
  context: { session: SessionToken | null; runId: string },
): Promise<{ response: AppResponse; events: ObservedEvent[] }> {
  try {
    return await handle(request, context.session, context.runId);
  } catch (error) {
    return { response: { status: 503, body: { error: errorMessage(error) } }, events: [] };
  }
}

/**
 * プレビューの状態。docs/formal/Preview.tla が、この状態とメッセージの扱いを検査する。
 * loading: iframe の読み込み（ready の通知）を待っている / idle: 何も表示していない。届くメッセージはすべて破棄する /
 * rendering: 描画中。観測した事象を collector に集める / showing: 描画を終えて表示している。プレビュー内の操作を受け付ける /
 * disposed: 破棄した
 */
type FrameState =
  | { name: 'loading' | 'idle' | 'disposed' }
  | { name: 'rendering'; context: FrameContext; collector: Collector }
  | { name: 'showing'; context: FrameContext };

export class PreviewFrame {
  readonly kind = 'preview';
  readonly element = document.createElement('iframe');
  /** 照合に失敗して破棄したメッセージの件数（検証用） */
  rejected = 0;
  private readonly ready: Promise<void>;
  private markReady!: () => void;
  private state: FrameState = { name: 'loading' };
  private readonly onMessage = (e: MessageEvent) => this.receive(e);

  constructor(
    src: URL,
    container: HTMLElement | null,
    private readonly handleRequest: FrameRequestHandler,
    private readonly onExchange?: (exchange: Exchange) => void,
  ) {
    this.ready = new Promise((resolve) => (this.markReady = resolve));
    // allow-scripts のみ。allow-same-origin・ポップアップ・トップ遷移・フォーム・ダウンロードは許可しない
    this.element.setAttribute('sandbox', 'allow-scripts');
    this.element.src = src.href;
    mountFrame(this.element, container, this.onMessage);
  }

  /** 画面を描画し、描画中に観測した事象を返す。以前の runId のメッセージはこれ以降破棄する */
  async render(params: RenderParams): Promise<ObservedEvent[]> {
    await this.ready;
    if (this.state.name === 'disposed') throw new RuntimeError('disposed', 'プレビューは破棄されています');
    // 前の描画が終わる前に次を始めたら、前の描画は結果を返さずに終える
    this.detach();
    const events: ObservedEvent[] = [];
    let collector!: Collector;
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RuntimeError('timeout', '画面の描画が時間内に終わりませんでした')), params.timeoutMs);
      collector = {
        events,
        rendered: () => (clearTimeout(timer), setTimeout(resolve, params.settleMs)),
        failed: (message) => (clearTimeout(timer), reject(new RuntimeError('crashed', message))),
      };
    });
    const context = { runId: params.runId, viewer: params.viewer, session: params.session, route: params.route };
    this.state = { name: 'rendering', context, collector };
    this.post({
      type: 'render',
      runId: params.runId,
      appId: params.appId,
      route: params.route,
      viewer: params.viewer,
      implementations: params.implementations,
      dataGeneration: params.dataGeneration,
    });
    try {
      await done;
    } finally {
      // 待っている間に止められたり、次の描画が始まったりしていたら、その状態を変えない
      if (this.active(params.runId)?.collector === collector) this.state = { name: 'showing', context };
    }
    return events;
  }

  /** 表示をやめ、以降のメッセージをすべて破棄する。描画中なら、その描画を失敗で終える */
  detach(): void {
    const state = this.state;
    if (state.name !== 'rendering' && state.name !== 'showing') return;
    this.state = { name: 'idle' };
    if (state.name === 'rendering') state.collector.failed('停止しました');
  }

  dispose(): void {
    this.detach();
    this.state = { name: 'disposed' };
    unmountFrame(this.element, this.onMessage);
  }

  private post(message: ToFrame): void {
    // 不透明な origin の相手には '*' しか指定できない。渡すのは架空の演習データだけ
    this.element.contentWindow?.postMessage(message, '*');
  }

  /** runId の画面を描画中・表示中なら、その文脈と、描画中の事象の集め先を返す。古い runId や表示していないときは null */
  private active(runId: string): { context: FrameContext; collector: Collector | null } | null {
    const state = this.state;
    if ((state.name !== 'rendering' && state.name !== 'showing') || state.context.runId !== runId) return null;
    return { context: state.context, collector: state.name === 'rendering' ? state.collector : null };
  }

  private receive(e: MessageEvent): void {
    if (e.source !== this.element.contentWindow) return;
    const message = parseFromFrame(e.data);
    if (!message) return void this.rejected++;
    if (message.type === 'ready') {
      if (this.state.name === 'loading') this.state = { name: 'idle' };
      return this.markReady();
    }
    const active = this.active(message.runId);
    if (!active) return void this.rejected++;
    const { context, collector } = active;

    switch (message.type) {
      case 'request':
        void this.forward(message.requestId, message.request, context);
        break;
      case 'event':
        collector?.events.push(message.event);
        this.onExchange?.({ runId: context.runId, actor: context.viewer, kind: 'render', route: context.route, events: [message.event] });
        break;
      case 'rendered':
        context.route = message.route;
        collector?.rendered(message.route);
        this.onExchange?.({ runId: context.runId, actor: context.viewer, kind: 'render', route: message.route, events: [] });
        break;
      case 'error':
        collector?.failed(message.message);
        break;
    }
  }

  private async forward(requestId: number, request: AppRequest, context: FrameContext): Promise<void> {
    const { response, events } = await forwardRequest(this.handleRequest, request, context);
    const active = this.active(context.runId);
    if (!active) return;
    active.collector?.events.push(...events);
    this.onExchange?.({ runId: context.runId, actor: context.viewer, kind: 'request', request, response, events });
    this.post({ type: 'response', runId: context.runId, requestId, response });
  }
}
