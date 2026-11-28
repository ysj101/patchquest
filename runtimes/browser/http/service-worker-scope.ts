// Service Worker の中で使う型（lib.dom にない分）と、範囲のリクエストすべてに答える Service Worker の決まった組み立て
export interface FetchEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface LifecycleEventLike {
  waitUntil(work: Promise<unknown>): void;
}
export interface WindowClientLike {
  url: string;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
export interface ServiceWorkerScope {
  registration: { scope: string };
  clients: { claim(): Promise<void>; matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEventLike) => void): void;
}

/**
 * 受け持つ範囲のリクエストすべてに respond で答える。新しい版は、入ったらすぐに古い版と切り替える
 * （待たせると、古い Service Worker が新しいページと食い違ったまま答え続ける）
 */
export function serve(respond: (request: Request, sw: ServiceWorkerScope) => Promise<Response>): void {
  const sw = self as unknown as ServiceWorkerScope;
  sw.addEventListener('install', (event) => {
    event.waitUntil(sw.skipWaiting());
  });
  sw.addEventListener('activate', (event) => {
    event.waitUntil(sw.clients.claim());
  });
  sw.addEventListener('fetch', (event) => {
    event.respondWith(respond(event.request, sw));
  });
}
