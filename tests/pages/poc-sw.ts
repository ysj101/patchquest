// PoC（Issue #232）の検証ページ。Service Worker を登録し、その応答を枠（iframe）で開いて、枠の中から見えたものを E2E へ返す
import type { RelayedResponse } from './poc-sw-worker';

const SCOPE = new URL('./poc-sw/', location.href);
const REPORT_TIMEOUT_MS = 2500;

/** 枠の中の調査（poc-sw-worker.ts の probe）が知らせる内容 */
interface ProbeReport {
  url: string;
  note: string;
  origin: string;
  storage: string;
  parentDom: string;
  cookie: string;
  controlled: string;
  api: string[];
  relay: string;
  script: string;
}

interface OpenOptions {
  /** 応答に付けるヘッダ（文書を返す経路 doc・form・echo が使う） */
  headers?: Record<string, string>;
  /** 枠に付ける sandbox 属性。省くと属性を付けない */
  sandbox?: string;
}

interface OpenResult {
  /** 枠の中のスクリプトが知らせた内容。スクリプトが動かなければ null */
  report: ProbeReport | null;
  /** Host から読めた枠の文書の題名。別オリジンで読めなければ「読めない」 */
  title: string;
}

function titleOf(frame: HTMLIFrameElement): string {
  try {
    return frame.contentDocument?.title ?? '読めない';
  } catch {
    return '読めない';
  }
}

/** スコープの下の URL を枠で開き、枠の中の調査の知らせを待つ。知らせが来なければ report は null */
function open(path: string, options: OpenOptions = {}): Promise<OpenResult> {
  const frame = document.createElement('iframe');
  if (options.sandbox !== undefined) frame.setAttribute('sandbox', options.sandbox);
  const url = new URL(path, SCOPE);
  if (options.headers) url.searchParams.set('h', JSON.stringify(options.headers));
  return new Promise((resolve) => {
    const finish = (report: ProbeReport | null) => {
      removeEventListener('message', onMessage);
      resolve({ report, title: titleOf(frame) });
      frame.remove();
    };
    const onMessage = (event: MessageEvent<{ pocSw?: ProbeReport }>) => {
      if (event.source === frame.contentWindow && event.data.pocSw) finish(event.data.pocSw);
    };
    addEventListener('message', onMessage);
    setTimeout(() => {
      finish(null);
    }, REPORT_TIMEOUT_MS);
    frame.src = url.href;
    document.body.append(frame);
  });
}

/** Host（Service Worker が受け持たないページ）からスコープの下を取得したときの結果。Service Worker を通れば 200、通らなければ静的サーバの 404 */
async function fetchFromHost(path: string): Promise<number> {
  return (await fetch(new URL(path, SCOPE))).status;
}

function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === 'activated') resolve();
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  });
}

// Service Worker からの問い合わせ（relay）に、Host が応答の中身を返す
navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ pocSwRelay?: string }>) => {
  const path = event.data.pocSwRelay;
  if (path === undefined) return;
  const answer: RelayedResponse = { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: `Host が ${path} に答えた` };
  event.ports[0]?.postMessage(answer);
});

const pocSw = { open, fetchFromHost };

declare global {
  interface Window {
    pocSw: typeof pocSw;
  }
}
window.pocSw = pocSw;

const registration = await navigator.serviceWorker.register(new URL('./poc-sw-worker.js', location.href), { scope: SCOPE.href, type: 'module' });
const worker = registration.installing ?? registration.waiting ?? registration.active;
if (!worker) throw new Error('Service Worker を登録できません');
await activated(worker);
document.body.dataset.ready = 'true';
