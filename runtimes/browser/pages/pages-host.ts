// ページを返すアプリ（http-pages）の Host 側。Service Worker を登録し、その問い合わせを、ページを開いた枠へ渡す。
// 枠には sandbox 属性を付けない（付けると枠への移動が Service Worker を通らない）。代わりに、Service Worker が
// すべての応答に隔離の CSP を付け、文書を不透明なオリジンにする（docs/poc/service-worker-http.md）
import {
  RuntimeError,
  isObj,
  type ActorKey,
  type AppRequest,
  type AppResponse,
  type Exchange,
  type ObservedEvent,
  type SessionToken,
} from '../../../platform/contract';
import { forwardRequest, isRequest, mountFrame, unmountFrame, type FrameRequestHandler, type RenderParams } from '../preview-host';
import { PAGES_DIR, SERVICE_WORKER_FILE, type RelayAnswer } from './protocol';

type Serve = (request: AppRequest) => Promise<AppResponse>;

/** 開いた回ごとの札と、その応答を作る枠。Service Worker の問い合わせは、札を持つ枠にだけ渡す */
const owners = new Map<string, Serve>();
let registered: Promise<void> | undefined;

function onServiceWorkerMessage(event: MessageEvent, scriptUrl: string): void {
  const port = event.ports[0];
  // 自分が登録した Service Worker からの、形の合う問い合わせだけを受ける
  if (!port || !(event.source instanceof ServiceWorker) || event.source.scriptURL !== scriptUrl) return;
  const ask: unknown = isObj(event.data) ? event.data.pqPages : null;
  const serve = isObj(ask) && typeof ask.token === 'string' && isRequest(ask.request) ? owners.get(ask.token) : undefined;
  if (!isObj(ask) || !serve) return void port.postMessage(null satisfies RelayAnswer);
  void serve(ask.request as AppRequest).then((response) => {
    port.postMessage({ response } satisfies RelayAnswer);
  });
}

function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (worker.state === 'activated') resolve();
      if (worker.state === 'redundant') reject(new RuntimeError('crashed', 'ページを配る仕組み（Service Worker）を用意できませんでした'));
    };
    worker.addEventListener('statechange', check);
    check();
  });
}

/** Service Worker を登録し、動き出すまで待つ。1 つの学習UIにつき 1 回だけ行う */
function ensureServiceWorker(assetsBase: URL): Promise<void> {
  registered ??= (async () => {
    const script = new URL(SERVICE_WORKER_FILE, assetsBase);
    navigator.serviceWorker.addEventListener('message', (event) => {
      onServiceWorkerMessage(event, script.href);
    });
    const registration = await navigator.serviceWorker.register(script, { scope: new URL(PAGES_DIR, assetsBase).href, type: 'module' });
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) throw new RuntimeError('crashed', 'ページを配る仕組み（Service Worker）を登録できませんでした');
    await activated(worker);
  })();
  // 失敗した登録を覚えたままにせず、次の準備でやり直せるようにする
  registered.catch(() => (registered = undefined));
  return registered;
}

interface PageContext {
  token: string;
  runId: string;
  viewer: ActorKey;
  session: SessionToken | null;
  /** いま開いているページのパス。枠の中のリンクやフォームで移動すると変わる */
  route: string;
}

interface Collector {
  events: ObservedEvent[];
  failed: (message: string) => void;
}

/**
 * 枠の状態。idle: 何も開いていない。届く知らせはすべて破棄する / rendering: 最初のページの読み込みを待っている。観測した事象を collector に集める /
 * showing: 読み込みを終えて表示している。枠の中の移動と知らせを受け付ける / disposed: 破棄した
 */
type PagesState = { name: 'idle' | 'disposed' } | { name: 'rendering'; context: PageContext; collector: Collector } | { name: 'showing'; context: PageContext };

function noticeEvent(data: unknown, token: string): ObservedEvent | null {
  if (!isObj(data) || data.pqPage !== token || !isObj(data.event)) return null;
  const { type, data: detail } = data.event;
  return typeof type === 'string' && isObj(detail) ? (data.event as unknown as ObservedEvent) : null;
}

export class PagesFrame {
  readonly kind = 'pages';
  readonly element = document.createElement('iframe');
  /** 照合に失敗して破棄した知らせの件数（検証用） */
  rejected = 0;
  private state: PagesState = { name: 'idle' };
  private readonly onMessage = (message: MessageEvent) => {
    this.receive(message);
  };

  constructor(
    private readonly assetsBase: URL,
    container: HTMLElement | null,
    private readonly handleRequest: FrameRequestHandler,
    private readonly onExchange?: (exchange: Exchange) => void,
  ) {
    mountFrame(this.element, container, this.onMessage);
  }

  /** ページを開き、読み込みが終わるまでに観測した事象を返す。前に開いたページの札はこれ以降使えない */
  async render(params: RenderParams): Promise<ObservedEvent[]> {
    if (this.state.name === 'disposed') throw new RuntimeError('disposed', 'プレビューは破棄されています');
    await ensureServiceWorker(this.assetsBase);
    this.detach();
    const context: PageContext = { token: crypto.randomUUID(), runId: params.runId, viewer: params.viewer, session: params.session, route: params.route };
    const events: ObservedEvent[] = [];
    let collector!: Collector;
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RuntimeError('timeout', 'ページの読み込みが時間内に終わりませんでした'));
      }, params.timeoutMs);
      // スクリプトが止められたページからは知らせが来ないので、読み込みの完了は枠の load で知る
      const loaded = () => {
        clearTimeout(timer);
        setTimeout(resolve, params.settleMs);
      };
      this.element.addEventListener('load', loaded, { once: true });
      const failed = (message: string) => {
        clearTimeout(timer);
        reject(new RuntimeError('crashed', message));
      };
      collector = { events, failed };
    });
    this.state = { name: 'rendering', context, collector };
    owners.set(context.token, (request) => this.serve(context, request));
    this.element.src = new URL(`${PAGES_DIR}${context.token}${params.route}`, this.assetsBase).href;
    try {
      await done;
    } finally {
      // 待っている間に止められたり、次のページを開いたりしていたら、その状態を変えない
      if (this.collectorOf(context) === collector) this.state = { name: 'showing', context };
    }
    return events;
  }

  /** 表示をやめ、開いていたページの札を使えなくする。読み込み中なら、その読み込みを失敗で終える */
  detach(): void {
    const opened = this.state;
    if (!('context' in opened)) return;
    owners.delete(opened.context.token);
    this.state = { name: 'idle' };
    if (opened.name === 'rendering') opened.collector.failed('停止しました');
  }

  dispose(): void {
    this.detach();
    unmountFrame(this.element, this.onMessage);
    this.state = { name: 'disposed' };
  }

  private collectorOf(context: PageContext): Collector | null {
    return this.state.name === 'rendering' && this.state.context === context ? this.state.collector : null;
  }

  /** 枠の中からのリクエスト（最初のページ・リンク・フォーム）を、閲覧者のセッションで教材ロジックへ渡す */
  private async serve(context: PageContext, request: AppRequest): Promise<AppResponse> {
    const { response, events } = await forwardRequest(this.handleRequest, request, context);
    if (request.method === 'GET' && response.status === 200) context.route = request.path;
    this.collectorOf(context)?.events.push(...events);
    this.onExchange?.({ runId: context.runId, actor: context.viewer, kind: 'request', request, response, events });
    return response;
  }

  private receive(message: MessageEvent): void {
    if (message.source !== this.element.contentWindow) return;
    const state = this.state;
    const event = state.name === 'rendering' || state.name === 'showing' ? noticeEvent(message.data, state.context.token) : null;
    if (!event || (state.name !== 'rendering' && state.name !== 'showing')) return void this.rejected++;
    this.collectorOf(state.context)?.events.push(event);
    this.onExchange?.({ runId: state.context.runId, actor: state.context.viewer, kind: 'render', route: state.context.route, events: [event] });
  }
}
