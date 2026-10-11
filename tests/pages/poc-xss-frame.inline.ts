// PoC: XSS演習用の隔離iframe（Issue #3）の中で動くスクリプト。
// 親から受け取ったコメントを text / html のどちらかで描画し、観測した事象を親へ報告する。

type RenderMessage = { type: 'render'; runId: string; mode: 'html' | 'text'; comments: string[]; navigationGuard: boolean };

interface TrustedTypePolicy {
  createHTML(input: string): unknown;
}
declare const trustedTypes: { createPolicy(name: string, rules: { createHTML: (s: string) => string }): TrustedTypePolicy } | undefined;

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

// 自由入力のHTMLがフレーム自体を遷移させて外部へ通信しないよう、遷移を起こす要素を描画前に取り除く。
// イベントハンドラーの実行可否はCSPのハッシュで制御するため、ここでは扱わない
if (trustedTypes) {
  const inert = trustedTypes.createPolicy('pq-inert', { createHTML: (s) => s });
  trustedTypes.createPolicy('default', {
    createHTML: (html) => {
      if (!navigationGuard) return html;
      const doc = new DOMParser().parseFromString(inert.createHTML(html) as string, 'text/html');
      doc.querySelectorAll('meta, base, link, form, iframe, frame, object, embed').forEach((el) => el.remove());
      doc.querySelectorAll('[href], [xlink\\:href], [action], [formaction]').forEach((el) => {
        for (const attr of ['href', 'xlink:href', 'action', 'formaction']) el.removeAttribute(attr);
      });
      return doc.body.innerHTML;
    },
  });
}

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
