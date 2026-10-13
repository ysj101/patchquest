// 隔離 iframe（sandbox="allow-scripts"、不透明な origin）の中で教材アプリの画面を動かす。
// 教材ロジックへの呼び出しはすべて Host を経由し、Host が閲覧者のセッションを付ける
import { ANONYMOUS, type AppRequest, type AppResponse, type ImplementationSelection } from '../../../platform/contract';
import type { AppModule, ViewContext } from '../app-module';
import type { FromFrame, ToFrame } from '../protocol';
import { findApp, resolveHook } from '../registry';
import { installNavigationGuard } from './navigation-guard';

const REQUEST_TIMEOUT_MS = 10_000;

let current: { runId: string; app: AppModule; viewer: string; implementations: ImplementationSelection } | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, (response: AppResponse) => void>();

function send(message: FromFrame): void {
  parent.postMessage(message, '*');
}

// 検証済みペイロードが呼ぶ無害な実行マーカー。CSP は `pqMarker()` というハンドラーだけをハッシュで許可している
Object.assign(window, {
  pqMarker: () => current && send({ type: 'event', runId: current.runId, event: { type: 'dom.marker', data: {} } }),
});

installNavigationGuard();

function request(runId: string, req: AppRequest): Promise<AppResponse> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('応答がありませんでした'));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, (response) => (clearTimeout(timer), resolve(response)));
    send({ type: 'request', runId, requestId, request: req });
  });
}

async function show(route: string): Promise<void> {
  const ctx = current;
  if (!ctx) return;
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const view: ViewContext = {
    request: (req) => request(ctx.runId, req),
    hook: (id) => resolveHook(ctx.app, ctx.implementations, id),
    navigate: (next) => void show(next),
    viewer: ctx.viewer === ANONYMOUS ? null : ctx.viewer,
    emit: (type, data) => send({ type: 'event', runId: ctx.runId, event: { type, data } }),
  };
  try {
    await ctx.app.render(root, route, view);
    if (current === ctx) send({ type: 'rendered', runId: ctx.runId, route });
  } catch (e) {
    if (current === ctx) send({ type: 'error', runId: ctx.runId, message: e instanceof Error ? e.message : String(e) });
  }
}

window.addEventListener('message', (e: MessageEvent<ToFrame>) => {
  if (e.source !== parent) return;
  const message = e.data;
  if (message?.type === 'render') {
    pendingRequests.clear();
    current = { runId: message.runId, app: findApp(message.appId), viewer: message.viewer, implementations: message.implementations };
    void show(message.route);
  } else if (message?.type === 'response' && message.runId === current?.runId) {
    pendingRequests.get(message.requestId)?.(message.response);
    pendingRequests.delete(message.requestId);
  }
});

send({ type: 'ready' });
