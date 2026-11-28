// 教材アプリの画面を、Service Worker が返す本物の HTTP 応答として開く枠の Host 側（必要機能 http）。
// 枠に sandbox 属性は付けない（付けると Service Worker を通らない）。隔離は、Service Worker がすべての応答に付けるヘッダが担う。
// Service Worker からの問い合わせは、インスタンスの名前と実行 ID で照合し、閲覧者のセッションを付けて教材ロジックへ渡す
import { RuntimeError, errorMessage, isObj, type AppRequest, type Exchange, type ObservedEvent } from '../../../platform/contract';
import type { FrameContext, FrameRequestHandler, Preview, RenderParams } from '../preview-host';
import { HTTP_PROTOCOL, HTTP_SCOPE_DIR, HTTP_WORKER_FILE, errorReply, leavesMount, normalizeAppPath, toAppRequest, toReply, type Mount, type RelayReply, type RelayRequest } from './mount';

/** Service Worker の登録。ページごとに 1 回だけ行い、失敗したら次の表示でやり直す */
let registered: Promise<void> | undefined;

function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = (): void => {
      if (worker.state === 'activated') resolve();
      if (worker.state === 'redundant') reject(new Error('Service Worker を有効にできませんでした'));
    };
    worker.addEventListener('statechange', check);
    check();
  });
}

/**
 * Service Worker を登録し、配布物と同じ版が有効になるまで待つ。同じアドレスの登録がすでにあると、register はファイルを取りに行かないので、
 * update で確かめる（配布物を入れ替えたあとに、前の版の Service Worker が、新しいページと食い違ったまま答えないようにする）
 */
async function register(assetsBase: URL): Promise<void> {
  const registration = await navigator.serviceWorker.register(new URL(HTTP_WORKER_FILE, assetsBase), { scope: new URL(HTTP_SCOPE_DIR, assetsBase).href, type: 'module' });
  await registration.update();
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error('Service Worker を登録できませんでした');
  await activated(worker);
}

function ensureRegistered(assetsBase: URL): Promise<void> {
  registered ??= register(assetsBase).catch((error: unknown) => {
    registered = undefined;
    throw new RuntimeError('crashed', `教材アプリの配信を始められませんでした：${errorMessage(error)}`);
  });
  return registered;
}

/** このブラウザとアドレスで Service Worker を使えるか（localhost か HTTPS で開いたときだけ使える） */
export const canServeHttp = (): boolean => 'serviceWorker' in navigator;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

interface Waiting {
  resolve: (events: ObservedEvent[]) => void;
  reject: (error: RuntimeError) => void;
}

const STOPPED = '演習は止まっています。演習の画面の「最初の画面を開き直す」を押してください。';

export class HttpFrame implements Preview {
  readonly kind = 'http';
  readonly element = node('div', 'http-preview');
  /** 表示していないときに届いて、断った問い合わせの件数（検証用） */
  rejected = 0;
  /** インスタンスの名前。URL の先頭に入り、ほかの枠・ほかのタブの演習と分ける */
  private readonly instance = crypto.randomUUID().slice(0, 8);
  private readonly at: Mount;
  private readonly frame = node('iframe', '');
  private readonly address = node('input', 'mono');
  private readonly go = node('button', 'button', '開く');
  private readonly message = node('p', 'form-message');
  private readonly externalUrl = node('p', 'mono http-external-url');
  private readonly external = node('div', 'http-external');
  private context: FrameContext | null = null;
  private waiting: Waiting | null = null;
  /** 最後に開けた画面のパス。外へ出たあとに戻る先 */
  private lastShown = '/';
  private disposed = false;
  /** 利用者がアドレス欄を書き換えている途中か。途中のあいだは、枠の移動に合わせた書き換えで、打っている文字を消さない */
  private typing = false;
  private readonly onMessage = (event: MessageEvent<unknown>) => this.receive(event);

  constructor(
    private readonly assetsBase: URL,
    container: HTMLElement | null,
    private readonly handleRequest: FrameRequestHandler,
    private readonly onExchange?: (exchange: Exchange) => void,
  ) {
    this.at = { mount: new URL(`${HTTP_SCOPE_DIR}${this.instance}/`, assetsBase).pathname, origin: assetsBase.origin };
    this.frame.title = '教材アプリ（学習用に脆弱性を注入した架空サービス）';
    this.build();
    if (!container) this.element.hidden = true;
    if (canServeHttp()) navigator.serviceWorker.addEventListener('message', this.onMessage);
    (container ?? document.body).append(this.element);
  }

  /** 画面を開き、最初の応答までに観測した事象を返す。以前の実行 ID への問い合わせは、これ以降断る */
  async render(params: RenderParams): Promise<ObservedEvent[]> {
    if (this.disposed) throw new RuntimeError('disposed', 'プレビューは破棄されています');
    if (!canServeHttp()) throw new RuntimeError('crashed', 'このアドレスでは Service Worker を使えません。localhost か HTTPS で開いてください');
    await ensureRegistered(this.assetsBase);
    this.detach();
    const path = normalizeAppPath(params.route, this.at.origin);
    if (path === null) throw new RuntimeError('crashed', `画面 ${params.route} は開けません`);
    const context = { runId: params.runId, viewer: params.viewer, session: params.session, route: path };
    this.context = context;
    const events = await new Promise<ObservedEvent[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RuntimeError('timeout', '画面の表示が時間内に終わりませんでした'));
      }, params.timeoutMs);
      this.waiting = {
        resolve: (seen) => {
          clearTimeout(timer);
          resolve(seen);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.open(path);
    }).finally(() => {
      if (this.context === context) this.waiting = null;
    });
    if (this.context === context) this.setUsable(true);
    if (params.settleMs > 0) await new Promise((resolve) => setTimeout(resolve, params.settleMs));
    return events;
  }

  /** 表示をやめ、以降の問い合わせを断る。表示を待っている途中なら、その表示を失敗で終える */
  detach(): void {
    const waiting = this.waiting;
    this.context = null;
    this.waiting = null;
    this.setUsable(false);
    waiting?.reject(new RuntimeError('crashed', '停止しました'));
  }

  dispose(): void {
    this.detach();
    this.disposed = true;
    if (canServeHttp()) navigator.serviceWorker.removeEventListener('message', this.onMessage);
    this.element.remove();
  }

  /** アドレス欄・外へ出たときの知らせ・枠を並べる。文字はすべてテキストとして入れる */
  private build(): void {
    const id = `http-address-${this.instance}`;
    const label = node('label', '', 'アドレス');
    label.htmlFor = id;
    Object.assign(this.address, { id, type: 'text', spellcheck: false, autocomplete: 'off' });
    this.go.type = 'submit';
    const form = node('form', 'http-address');
    form.append(label, this.address, this.go);
    this.address.addEventListener('input', () => {
      this.typing = true;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.openTyped();
    });
    this.message.setAttribute('role', 'alert');
    const back = node('button', 'button', '教材アプリへ戻る');
    back.type = 'button';
    back.addEventListener('click', () => {
      if (this.context) this.open(this.lastShown);
    });
    this.external.setAttribute('role', 'status');
    this.external.hidden = true;
    this.external.append(
      node('h3', '', '教材アプリの外へ移動するところでした'),
      node('p', '', '教材アプリの応答が、ブラウザを次のアドレスへ移動させようとしました。'),
      this.externalUrl,
      node('p', '', '本物のサービスなら、ここでこのアドレスの画面が開きます。'),
      node('p', '', 'この教材は外へ通信しないので、移動はここで止めています。'),
      back,
    );
    // 枠は隠さず、知らせを上に重ねる（隠した枠を出し直してすぐに開くと、Chrome が中身を描かないことがある）
    const stage = node('div', 'http-stage');
    stage.append(this.frame, this.external);
    this.element.append(form, this.message, stage);
    this.setUsable(false);
  }

  /** アドレス欄を使えるのは、画面を開いているあいだだけ。開く前に入れた値が、最初の画面の表示で消えないようにする */
  private setUsable(usable: boolean): void {
    this.address.disabled = !usable;
    this.go.disabled = !usable;
  }

  /** 利用者がアドレス欄に入れたパスを開く */
  private openTyped(): void {
    const path = normalizeAppPath(this.address.value.trim(), this.at.origin);
    if (path === null) this.message.textContent = 'アドレスは、/ で始まる教材アプリの中のパスで入れてください（例：/login）。';
    else if (!this.context) this.message.textContent = STOPPED;
    else this.open(path);
  }

  private open(path: string): void {
    this.message.textContent = '';
    this.external.hidden = true;
    this.typing = false;
    this.address.value = path;
    this.frame.src = `${this.at.origin}${this.at.mount}${path.slice(1)}`;
  }

  private receive(event: MessageEvent<unknown>): void {
    const relay = isObj(event.data) ? event.data.pqHttp : undefined;
    const port = event.ports[0];
    // ほかの枠・ほかのタブのインスタンスへの問い合わせには答えない（持ち主が答える）
    if (!isObj(relay) || relay.instance !== this.instance || !port) return;
    void this.answer(relay as unknown as RelayRequest).then((reply) => {
      port.postMessage(reply);
    });
  }

  private async answer(relay: RelayRequest): Promise<RelayReply> {
    if (relay.protocol !== HTTP_PROTOCOL) return errorReply(503, '教材の更新が途中です。ページを読み込み直してください。');
    const context = this.context;
    if (!context) {
      this.rejected++;
      return errorReply(503, STOPPED);
    }
    const request = toAppRequest(relay.method, relay.path, relay.form);
    if (!request) return errorReply(405, 'この教材アプリは、GET と POST だけを受け付けます。');
    try {
      const { response, events } = await this.handleRequest(request, context.session, context.runId);
      const reply = toReply(response, this.at);
      if (this.context !== context) return errorReply(503, STOPPED);
      this.onExchange?.({ runId: context.runId, actor: context.viewer, kind: 'request', request, response, events });
      this.track(request, reply);
      this.waiting?.resolve(events);
      return reply;
    } catch (error) {
      if (this.context === context) this.waiting?.reject(error instanceof RuntimeError ? error : new RuntimeError('crashed', errorMessage(error)));
      return errorReply(503, errorMessage(error));
    }
  }

  /** アドレス欄を、枠がいま開いている画面に合わせる。応答が外への移動なら、枠の代わりに知らせを出す */
  private track(request: AppRequest, reply: RelayReply): void {
    const location = reply.headers.location;
    if (reply.status >= 300 && reply.status < 400 && location !== undefined) {
      // 中での移動は、次の問い合わせでアドレス欄が変わる
      if (leavesMount(location, request.path, this.at)) this.showExternal(new URL(location, `${this.at.origin}${this.at.mount}`).href);
      return;
    }
    this.showAddress(request.path);
    if (request.method === 'GET' && reply.status === 200) this.lastShown = request.path;
  }

  private showAddress(address: string): void {
    if (!this.typing) this.address.value = address;
  }

  /** 外への移動そのものは、学習UIのページの CSP（frame-src 'self'）がブラウザの中で止める。枠には止められた跡が残るので、上に知らせを重ねる */
  private showExternal(url: string): void {
    this.showAddress(url);
    this.externalUrl.textContent = url;
    this.external.hidden = false;
  }
}
