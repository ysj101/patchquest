// PoC: XSS演習用の隔離iframe（Issue #3）のホスト側。E2E から window.pocXss を呼び出す。

export {};

type FrameName = 'strict' | 'loose';
type FrameEvent = { type: string; runId: string | null; [key: string]: unknown };

const EVENT_TYPES = new Set(['ready', 'rendered', 'marker', 'probe', 'csp-violation']);

class Frame {
  readonly el = document.createElement('iframe');
  runId: string | null = null;
  events: FrameEvent[] = [];
  loads = 0;

  constructor(src: string) {
    // allow-scripts のみ。allow-same-origin・ポップアップ・トップ遷移・フォーム・ダウンロードは許可しない
    this.el.setAttribute('sandbox', 'allow-scripts');
    this.el.src = src;
    this.el.addEventListener('load', () => this.loads++);
    document.body.append(this.el);
  }
}

const frameByName: Record<FrameName, Frame> = {
  strict: new Frame('./poc-xss-frame.html'),
  loose: new Frame('./poc-xss-frame-loose.html'),
};
const rejected: { reason: string; data: unknown }[] = [];

function isFrameEvent(data: unknown): data is FrameEvent {
  if (typeof data !== 'object' || data === null) return false;
  const { type, runId } = data as Record<string, unknown>;
  return typeof type === 'string' && EVENT_TYPES.has(type) && (runId === null || typeof runId === 'string');
}

// opaque origin の文字列（"null"）は信頼せず、送信元ウィンドウ・スキーマ・実行IDで照合する
window.addEventListener('message', (e) => {
  const frame = Object.values(frameByName).find((f) => f.el.contentWindow === e.source);
  if (!frame) return void rejected.push({ reason: 'unknown-source', data: e.data });
  if (!isFrameEvent(e.data)) return void rejected.push({ reason: 'schema', data: e.data });
  if (e.data.type !== 'ready' && e.data.runId !== frame.runId) return void rejected.push({ reason: 'stale-run', data: e.data });
  frame.events.push(e.data);
});

// ホスト側の保護対象。フレームから読めないことを確かめる
localStorage.setItem('pq-host-secret', 'host-secret');

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** フレームが描画を終えたことを待ち、非同期に起きる事象（画像のエラーや遷移）のためにさらに waitMs 待つ */
async function rendered(frame: Frame, waitMs: number): Promise<void> {
  for (let i = 0; i < 100 && !frame.events.some((e) => e.type === 'rendered'); i++) await settle(20);
  await settle(waitMs);
}

const poc = {
  ready: () => Object.values(frameByName).every((f) => f.events.some((e) => e.type === 'ready')),

  async render(name: FrameName, mode: 'html' | 'text', comments: string[], navigationGuard = true, waitMs = 150) {
    const frame = frameByName[name];
    frame.runId = crypto.randomUUID();
    frame.events = [];
    frame.el.contentWindow!.postMessage({ type: 'render', runId: frame.runId, mode, comments, navigationGuard }, '*');
    await rendered(frame, waitMs);
    return { events: frame.events, loads: frame.loads };
  },

  /** 実行IDを切り替えた直後に、古い実行IDのままのメッセージが届く状況を作る */
  async renderTwice(name: FrameName, comments: string[]) {
    const frame = frameByName[name];
    const first = crypto.randomUUID();
    frame.el.contentWindow!.postMessage({ type: 'render', runId: first, mode: 'text', comments, navigationGuard: true }, '*');
    frame.runId = crypto.randomUUID();
    frame.events = [];
    frame.el.contentWindow!.postMessage({ type: 'render', runId: frame.runId, mode: 'text', comments, navigationGuard: true }, '*');
    await rendered(frame, 50);
    return { first, current: frame.runId, events: frame.events };
  },

  /** フレーム以外のウィンドウから、正しい形のメッセージを送る */
  async forgeFromHost(name: FrameName) {
    window.postMessage({ type: 'marker', runId: frameByName[name].runId }, '*');
    await settle(100);
  },

  rejected: () => rejected,
  hostUrl: () => location.href,
  hostSecret: () => localStorage.getItem('pq-host-secret'),
};

declare global {
  interface Window {
    pocXss: typeof poc;
  }
}
window.pocXss = poc;
