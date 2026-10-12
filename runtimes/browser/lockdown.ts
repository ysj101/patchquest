// Worker は Host と同じ origin で動くため、教材ロジックが Host の保存領域や外部へ届かないよう、
// 初期化（SQLite WASM の読み込み）を終えたあとに通信・保存の API を使えなくする（spec §14）
const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'indexedDB', 'caches', 'importScripts'] as const;

let locked = false;

export function lockdown(scope: object = globalThis): void {
  if (locked) return;
  locked = true;
  for (const name of BLOCKED) {
    Object.defineProperty(scope, name, {
      configurable: false,
      get() {
        throw new Error(`${name} は演習環境では使えません`);
      },
    });
  }
}
