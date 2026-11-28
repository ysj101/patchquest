// ページを返すアプリ（http-pages）のサーバ役。スコープ（<assets>/pages/）の下へのリクエストを、札の持ち主の Host へ問い合わせ、
// 返ってきた中身を本物の HTTP 応答にしてブラウザへ返す。教材ロジックと状態は持たない（止まるとメモリを失うため）。外へは通信しない
import { HTTP_METHODS, type AppRequest, type AppResponse, type HttpMethod } from '../../../platform/contract';
import { ISOLATION_POLICY, type RelayAnswer, type RelayAsk } from './protocol';

/** lib.dom にない Service Worker の型のうち、ここで使う分 */
interface FetchEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface LifecycleEventLike {
  waitUntil(work: Promise<unknown>): void;
}
interface WindowClientLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
}
interface ServiceWorkerScope {
  registration: { scope: string };
  clients: { claim(): Promise<void>; matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEventLike) => void): void;
}

const sw = self as unknown as ServiceWorkerScope;
/** Host の応答を待つ上限。演習用の機械を使う呼び出しの上限（20 秒）より長くする */
const RELAY_TIMEOUT_MS = 30_000;

const plain = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': ISOLATION_POLICY } });

/** 1 つの Host に尋ねる。知らない札・時間切れは null */
function ask(host: WindowClientLike, message: RelayAsk): Promise<RelayAnswer> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      resolve(null);
    }, RELAY_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<RelayAnswer>) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    host.postMessage(message, [channel.port2]);
  });
}

/** 開いているすべての学習UIに尋ね、札の持ち主の応答を返す。持ち主がいなければ null */
async function relay(message: RelayAsk): Promise<RelayAnswer> {
  const hosts = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return new Promise((resolve) => {
    let waiting = hosts.length;
    if (waiting === 0) resolve(null);
    for (const host of hosts) {
      void ask(host, message).then((answer) => {
        waiting -= 1;
        if (answer) resolve(answer);
        else if (waiting === 0) resolve(null);
      });
    }
  });
}

/** フォームの送信（POST）の本文を、名前と値の組にする */
async function formBody(request: Request): Promise<Record<string, string>> {
  const body: Record<string, string> = {};
  for (const [name, value] of await request.formData()) if (typeof value === 'string') body[name] = value;
  return body;
}

/**
 * 教材アプリの応答を HTTP 応答にする。location は、同じ札の下のパスへ書き換える（アプリの外へは移動させない）。
 * 隔離の CSP は、教材アプリのヘッダとは別のポリシーとして必ず付ける
 */
function toHttp(response: AppResponse, pageBase: string): Response {
  const text = typeof response.body === 'string';
  const headers = new Headers({ 'content-type': text ? 'text/html; charset=utf-8' : 'application/json' });
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    if (name !== 'location') headers.append(name, value);
    else if (/^\/(?!\/)/.test(value)) headers.set(name, `${pageBase}${value}`);
    else throw new Error(`移動先 ${value} は、アプリの中のパスではありません`);
  }
  headers.append('content-security-policy', ISOLATION_POLICY);
  return new Response(text ? (response.body as string) : JSON.stringify(response.body), { status: response.status, headers });
}

async function respond(request: Request): Promise<Response> {
  const [token = '', ...rest] = request.url.slice(sw.registration.scope.length).split('/');
  if (!(HTTP_METHODS as readonly string[]).includes(request.method)) return plain(405, 'この方法では呼び出せません');
  const appRequest: AppRequest = { method: request.method as HttpMethod, path: `/${rest.join('/')}` };
  if (request.method !== 'GET') appRequest.body = await formBody(request);
  const answer = await relay({ pqPages: { token, request: appRequest } });
  if (!answer) return plain(404, 'この画面は、もう使えません。学習画面から開き直してください。');
  try {
    return toHttp(answer.response, `${sw.registration.scope}${token}`);
  } catch (error) {
    return plain(502, `応答を作れませんでした：${error instanceof Error ? error.message : String(error)}`);
  }
}

sw.addEventListener('install', (event) => {
  event.waitUntil(sw.skipWaiting());
});
sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});
sw.addEventListener('fetch', (event) => {
  event.respondWith(respond(event.request));
});
