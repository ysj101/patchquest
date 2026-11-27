// PoC（Issue #232）：Service Worker をサーバ役にして、本物の HTTP 応答を返す。検証ページ poc-sw.html が登録する。
// スコープ（poc-sw/）の下の URL を「<インスタンス>/<経路>」として受け、インスタンスごとに状態を分ける

/** lib.dom にない Service Worker の型のうち、この PoC で使う分 */
interface FetchEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface LifecycleEventLike {
  waitUntil(work: Promise<unknown>): void;
}
interface WindowClientLike {
  url: string;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
interface ServiceWorkerScope {
  registration: { scope: string };
  clients: { claim(): Promise<void>; matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEventLike) => void): void;
}

/** 検証ページ（Host）が relay の問い合わせに返す応答 */
export interface RelayedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const sw = self as unknown as ServiceWorkerScope;
const RELAY_TIMEOUT_MS = 3000;

/** インスタンスごとの、api が呼ばれた回数。Service Worker のメモリにだけ置く（止まると消えることを PoC で確かめる） */
const hits = new Map<string, number>();

/**
 * doc の文書の中で動く調査。枠の中から届くもの・届かないものを親へ知らせる。
 * 文字列にして文書へ埋め込むので、この関数の外の値を参照しない
 */
async function probe(): Promise<void> {
  const attempt = async (work: () => unknown): Promise<string> => {
    try {
      return String(await work());
    } catch (error) {
      return `threw:${error instanceof Error ? error.name : String(error)}`;
    }
  };
  const get = (path: string) => attempt(async () => {
    const response = await fetch(path);
    return `${String(response.status)}:${await response.text()}`;
  });
  const load = (path: string) =>
    new Promise<string>((resolve) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => {
        resolve('loaded');
      };
      script.onerror = () => {
        resolve('error');
      };
      document.head.append(script);
    });
  const report = {
    url: location.pathname.split('/').pop() ?? '',
    note: decodeURIComponent(document.body.dataset.note ?? ''),
    origin: self.origin,
    storage: await attempt(() => localStorage.length >= 0),
    parentDom: await attempt(() => parent.document.title),
    cookie: await attempt(() => document.cookie),
    controlled: await attempt(() => navigator.serviceWorker.controller !== null),
    api: [await get('api?cc=max-age%3D600'), await get('api?cc=max-age%3D600')],
    relay: await get('relay'),
    script: await load('script'),
  };
  // 親（Host）は、この文書の URL と同じオリジンにある。文書が不透明なオリジンになっていても、location.origin は URL のオリジンを返す
  parent.postMessage({ pocSw: report }, location.origin);
}

const page = (body: string, note = '') =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>PoC 文書</title></head><body data-note="${encodeURIComponent(note)}"><p>PoC 文書</p>${body}</body></html>`;

/** 調査を埋め込んだ文書。note は、応答を作ったときに Service Worker が見たもの（文書の中の調査がそのまま知らせる） */
const probed = (note = '') => page(`<script>(${probe.toString()})()</script>`, note);

/** 開くとすぐに、同じヘッダの指定を付けて echo へ POST するフォームの文書 */
const posting = (search: string) =>
  page(`<form method="post" action="echo${search}"><input name="memo" value="hello"></form><script>document.forms[0].submit()</script>`);

/** 検証ページへ応答の中身を問い合わせる。教材ロジックを Service Worker の外（既存の Worker）に置く構成を想定した経路 */
async function relay(path: string): Promise<Response> {
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const host = windows.find((client) => new URL(client.url).pathname.endsWith('/poc-sw.html'));
  if (!host) return new Response('検証ページが見つかりません', { status: 502 });
  const channel = new MessageChannel();
  const answer = new Promise<RelayedResponse>((resolve, reject) => {
    channel.port1.onmessage = (event: MessageEvent<RelayedResponse>) => {
      resolve(event.data);
    };
    setTimeout(() => {
      reject(new Error('検証ページから応答がありません'));
    }, RELAY_TIMEOUT_MS);
  });
  host.postMessage({ pocSwRelay: path }, [channel.port2]);
  const { status, headers, body } = await answer;
  return new Response(body, { status, headers });
}

/** 文書の応答。ヘッダは、検証ページが h に JSON で渡したものをそのまま付ける */
function html(body: string, url: URL): Response {
  const headers = JSON.parse(url.searchParams.get('h') ?? '{}') as Record<string, string>;
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

async function respond(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const [instance = '', route = ''] = url.href.slice(sw.registration.scope.length).split('?')[0]?.split('/') ?? [];
  switch (route) {
    case 'doc':
      return html(probed(), url);
    case 'form':
      return html(posting(url.search), url);
    case 'echo':
      return html(probed(`${request.method} ${await request.text()}`), url);
    case 'script':
      return new Response('void 0;', { headers: { 'content-type': 'text/javascript' } });
    case 'api': {
      const count = (hits.get(instance) ?? 0) + 1;
      hits.set(instance, count);
      const body = JSON.stringify({ hits: count, cookie: request.headers.get('cookie') });
      return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': url.searchParams.get('cc') ?? 'no-store' } });
    }
    case 'redirect':
      return new Response(null, { status: 302, headers: { location: url.searchParams.get('to') ?? 'doc' } });
    case 'relay':
      return relay(`${instance}/${route}`);
    default:
      return new Response('not found', { status: 404 });
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
