// RuntimeAdapter の E2E 用ページ。演習用（プレビュー表示あり）と検証用（非表示）の 2 インスタンスを置く
import type { Exchange } from '../../platform/contract';
import { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';

const assetsBase = new URL('/assets/', location.origin);
const exchanges: Exchange[] = [];
const adapters = {
  exercise: new BrowserRuntimeAdapter({ container: document.getElementById('preview')!, assetsBase, onExchange: (x) => exchanges.push(x) }),
  verifier: new BrowserRuntimeAdapter({ assetsBase }),
};

type Name = keyof typeof adapters;
type Settled = { ok: true; value: unknown } | { ok: false; code: string; message: string };

const runtimeTest = {
  /** アダプターのメソッドを呼び、例外も含めて結果を返す（RuntimeError の code を E2E から確かめるため） */
  async call(name: Name, method: string, ...args: unknown[]): Promise<Settled> {
    const adapter = adapters[name] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    try {
      return { ok: true, value: await adapter[method]!.apply(adapters[name], args) };
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? 'unknown', message: e instanceof Error ? e.message : String(e) };
    }
  },
  exchanges: () => exchanges,
  rejected: (name: Name) => adapters[name].rejectedFrameMessages,
};

declare global {
  interface Window {
    runtimeTest: typeof runtimeTest;
  }
}
window.runtimeTest = runtimeTest;
document.body.dataset.ready = 'true';
