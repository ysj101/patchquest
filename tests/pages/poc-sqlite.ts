// PoC: Worker上のSQLite WASM（Issue #2）。E2E から window.poc を呼び出して計測する。
import type { PocRequest } from './poc-sqlite.worker';

class TimeoutError extends Error {}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function spawn(): Worker {
  const w = new Worker(new URL('./poc-sqlite.worker.js', import.meta.url), { type: 'module' });
  w.addEventListener('message', (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.ok) p?.resolve(e.data.result);
    else p?.reject(new Error(e.data.error));
  });
  return w;
}

function terminate(): void {
  worker?.terminate();
  worker = undefined;
  for (const p of pending.values()) p.reject(new Error('stopped'));
  pending.clear();
}

function call<T>(req: PocRequest, timeoutMs = 5000): Promise<T> {
  if (!worker) throw new Error('Worker がありません');
  const id = nextId++;
  const w = worker;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // 実行中のWASMは外から中断できないため、Workerごと破棄する
      pending.delete(id);
      if (worker === w) terminate();
      reject(new TimeoutError(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v as T)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    w.postMessage({ id, req });
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
