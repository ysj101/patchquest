// Worker は Host と同じ origin で動くため、教材ロジックが Host の保存領域や外部へ届かないよう、
// 初期化（SQLite WASM の読み込み）を終えたあとに通信・保存・別の実行環境を作る API を使えなくする（spec §14）。
// Worker の大域スコープは差し替えられず許可リスト方式にできないため、該当する API を列挙して塞ぐ。
// Worker で動くのは同梱した信頼済みのコードだけで、入力を実行する経路はない。これは多層防御である
const BLOCKED = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'BroadcastChannel',
  'indexedDB',
  'caches',
  'importScripts',
  'Worker',
  'SharedWorker',
] as const;

let locked = false;

export function lockdown(scope: object = globalThis): void {
  if (locked) return;
  locked = true;
  const block = (target: object, name: string) =>
    Object.defineProperty(target, name, {
      configurable: false,
      get() {
        throw new Error(`${name} は演習環境では使えません`);
      },
    });
  for (const name of BLOCKED) block(scope, name);
  // OPFS など origin の保存領域
  if ('navigator' in scope) block((scope as { navigator: object }).navigator, 'storage');
}
