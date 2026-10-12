// PoC: XSS演習用の隔離iframe（Issue #3）の中で動くスクリプト。
// 親から受け取ったコメントを text / html のどちらかで描画し、観測した事象を親へ報告する。

import { installNavigationGuard } from '../../runtimes/browser/preview/navigation-guard';

type RenderMessage = { type: 'render'; runId: string; mode: 'html' | 'text'; comments: string[]; navigationGuard: boolean };

let runId: string | null = null;
let navigationGuard = false;

function report(event: Record<string, unknown>): void {
  parent.postMessage({ ...event, runId }, '*');
}

// 検証済みペイロードが呼ぶ無害な実行マーカー。実DOMでスクリプトが動いたことの証拠になる
Object.assign(window, {
  pqMarker: () => report({ type: 'marker' }),
  // 隔離の確認用（テスト専用ページだけで使う）。結果か例外名を報告する
  pqProbe: async (name: string, fn: () => unknown) => {
    try {
      report({ type: 'probe', name, outcome: 'returned', detail: String(await fn()) });
    } catch (e) {
      report({ type: 'probe', name, outcome: 'threw', detail: e instanceof Error ? e.name : String(e) });
    }
  },
});

document.addEventListener('securitypolicyviolation', (e) =>
  report({ type: 'csp-violation', directive: e.effectiveDirective, blockedURI: e.blockedURI }),
);

// 本番のプレビューと同じ遷移ガード。PoC では無効にしたときの挙動も確かめる
installNavigationGuard(() => navigationGuard);

window.addEventListener('message', (e: MessageEvent<RenderMessage>) => {
  if (e.source !== parent || e.data?.type !== 'render') return;
  ({ runId, navigationGuard } = e.data);
  const items = e.data.comments.map((comment) => {
    const li = document.createElement('li');
    if (e.data.mode === 'html') li.innerHTML = comment;
    else li.textContent = comment;
    return li;
  });
  document.getElementById('comments')!.replaceChildren(...items);
  report({ type: 'rendered', count: items.length });
});

report({ type: 'ready' });
