// 隔離 iframe（プレビュー）の Host 側。メッセージは送信元ウィンドウ・スキーマ・実行 ID で照合する（spec §14）
import {
  HTTP_METHODS,
  RuntimeError,
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function isRequest(v: unknown): v is AppRequest {
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

export class PreviewFrame {
  readonly element = document.createElement('iframe');
  /** 照合に失敗して破棄したメッセージの件数（検証用） */
  rejected = 0;
  private readonly ready: Promise<void>;
  private markReady!: () => void;
  private current: FrameContext | null = null;
  private collector: Collector | null = null;
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
    this.element.title = '教材アプリ（学習用に脆弱性を注入した架空サービス）';
    this.element.src = src.href;
    if (!container) this.element.hidden = true;
    window.addEventListener('message', this.onMessage);
    (container ?? document.body).append(this.element);
  }

  get route(): string | null {
    return this.current?.route ?? null;
  }

  /** 画面を描画し、描画中に観測した事象を返す。以前の runId のメッセージはこれ以降破棄する */
  async render(params: RenderParams): Promise<ObservedEvent[]> {
    await this.ready;
    this.current = { runId: params.runId, viewer: params.viewer, session: params.session, route: params.route };
    const events: ObservedEvent[] = [];
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RuntimeError('timeout', '画面の描画が時間内に終わりませんでした')), params.timeoutMs);
      this.collector = {
        events,
        rendered: () => (clearTimeout(timer), setTimeout(resolve, params.settleMs)),
        failed: (message) => (clearTimeout(timer), reject(new RuntimeError('crashed', message))),
      };
    });
    this.post({
      type: 'render',
      runId: params.runId,
      appId: params.appId,
      route: params.route,
      viewer: params.viewer,
      implementations: params.implementations,
    });
    try {
      await done;
    } finally {
      this.collector = null;
    }
    return events;
  }

  /** 以降のメッセージをすべて破棄する */
  detach(): void {
    this.current = null;
    this.collector?.failed('停止しました');
    this.collector = null;
  }

  dispose(): void {
    this.detach();
    window.removeEventListener('message', this.onMessage);
    this.element.remove();
  }

  private post(message: ToFrame): void {
    // 不透明な origin の相手には '*' しか指定できない。渡すのは架空の演習データだけ
    this.element.contentWindow?.postMessage(message, '*');
  }

  private receive(e: MessageEvent): void {
    if (e.source !== this.element.contentWindow) return;
    const message = parseFromFrame(e.data);
    if (!message) return void this.rejected++;
    if (message.type === 'ready') return this.markReady();
    const current = this.current;
    if (!current || message.runId !== current.runId) return void this.rejected++;

    switch (message.type) {
      case 'request':
        void this.forward(message.requestId, message.request, current);
        break;
      case 'event':
        this.collector?.events.push(message.event);
        this.onExchange?.({ runId: current.runId, actor: current.viewer, kind: 'render', route: current.route, events: [message.event] });
        break;
      case 'rendered':
        current.route = message.route;
        this.collector?.rendered(message.route);
        this.onExchange?.({ runId: current.runId, actor: current.viewer, kind: 'render', route: message.route, events: [] });
        break;
      case 'error':
        this.collector?.failed(message.message);
        break;
    }
  }

  private async forward(requestId: number, request: AppRequest, current: FrameContext): Promise<void> {
    let response: AppResponse;
    let events: ObservedEvent[] = [];
    try {
      ({ response, events } = await this.handleRequest(request, current.session, current.runId));
    } catch (e) {
      response = { status: 503, body: { error: e instanceof Error ? e.message : String(e) } };
    }
    if (this.current?.runId !== current.runId) return;
    this.collector?.events.push(...events);
    this.onExchange?.({ runId: current.runId, actor: current.viewer, kind: 'request', request, response, events });
    this.post({ type: 'response', runId: current.runId, requestId, response });
  }
}
