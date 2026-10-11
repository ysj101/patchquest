// PoC: Worker上のSQLite WASM（Issue #2）。E2E から window.poc を呼び出して計測する。
import type { PocRequest } from './poc-sqlite.worker';

class TimeoutError extends Error {}

// 検証は1件ずつ順に呼び出すため、実行中の呼び出しは常に高々1つ
let worker: Worker | undefined;
let pending: { resolve: (v: unknown) => void; reject: (e: Error) => void } | undefined;

function spawn(): Worker {
  const w = new Worker(new URL('./poc-sqlite.worker.js', import.meta.url), { type: 'module' });
  w.addEventListener('message', (e: MessageEvent<{ ok: boolean; result?: unknown; error?: string }>) => {
    if (e.data.ok) pending?.resolve(e.data.result);
    else pending?.reject(new Error(e.data.error));
  });
  return w;
}

function terminate(): void {
  worker?.terminate();
  worker = undefined;
  pending?.reject(new Error('stopped'));
}

function call<T>(req: PocRequest, timeoutMs = 5000): Promise<T> {
  if (!worker) throw new Error('Worker がありません');
  if (pending) throw new Error('前の呼び出しが実行中です');
  const w = worker;
  return new Promise<T>((resolve, reject) => {
    const settle = () => (clearTimeout(timer), (pending = undefined));
    const timer = setTimeout(() => {
      // 実行中のWASMは外から中断できないため、Workerごと破棄する
      settle();
      if (worker === w) terminate();
      reject(new TimeoutError(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    pending = {
      resolve: (v) => (settle(), resolve(v as T)),
      reject: (e) => (settle(), reject(e)),
    };
    w.postMessage(req);
  });
}

async function start(): Promise<{ totalMs: number; initMs: number }> {
  terminate();
  const started = performance.now();
  worker = spawn();
  const { initMs } = await call<{ initMs: number }>({ op: 'init' }, 10_000);
  return { totalMs: performance.now() - started, initMs };
}

const poc = {
  start,
  search: (mode: 'param' | 'concat', ownerId: number, q: string) => call({ op: 'search', mode, ownerId, q }),
  insert: (ownerId: number, title: string) => call({ op: 'insert', ownerId, title }),
  count: () => call<number>({ op: 'count' }),
  async busy(timeoutMs: number): Promise<{ timedOut: boolean; elapsedMs: number }> {
    const started = performance.now();
    try {
      await call({ op: 'busy' }, timeoutMs);
      return { timedOut: false, elapsedMs: performance.now() - started };
    } catch (e) {
      return { timedOut: e instanceof TimeoutError, elapsedMs: performance.now() - started };
    }
  },
};

declare global {
  interface Window {
    poc: typeof poc;
  }
}
window.poc = poc;
document.body.dataset.ready = 'true';
