// ページを返すアプリ（http-pages）のページが読み込む静的スクリプト（assets/page.js）。ページと同じ場所から配るファイルなので、
// CSP で「同じ場所のスクリプトだけ」に絞ったページでも動く。ページで起きたことを Host へ知らせ、アプリ自身のスクリプトを呼ぶ
import type { ObservedEvent } from '../../../platform/contract';
import { findApp } from '../registry';
import { PAGES_DIR, type PageNotice } from './protocol';

const script = document.currentScript;
if (!(script instanceof HTMLScriptElement)) throw new Error('page.js は、ページの script 要素から読み込みます');
const appId = script.dataset.app;
if (!appId) throw new Error('page.js の script 要素に data-app がありません');

/** ページの URL（<assets>/pages/<札>/…）から取り出した、このページを開いた回の札 */
const token = location.href.slice(new URL(PAGES_DIR, script.src).href.length).split('/')[0] ?? '';

function notify(event: ObservedEvent): void {
  // 親（Host）は、このページの URL と同じオリジンにある。文書が不透明なオリジンになっていても、location.origin は URL のオリジンを返す
  parent.postMessage({ pqPage: token, event } satisfies PageNotice, location.origin);
}

/** 実行マーカーが呼ばれたことを、ページの上にも出す。教材データは入れない */
function showMarker(): void {
  if (document.querySelector('[data-pq-marker]')) return;
  const banner = document.createElement('p');
  banner.dataset.pqMarker = '';
  banner.setAttribute('role', 'status');
  banner.textContent = '⚠ ページに書きこまれたスクリプトが動きました（教材用の目印）';
  Object.assign(banner.style, { margin: '0 0 12px', padding: '8px 12px', border: '2px solid #b3261e', background: '#fdecea', color: '#7a1c16', fontWeight: 'bold' });
  document.body.prepend(banner);
}

// 検証済みの攻撃の文字列が呼ぶ、無害な実行マーカー。呼ばれたことを記録するだけで、ほかのことはしない
Object.assign(window, {
  pqMarker: () => {
    notify({ type: 'dom.marker', data: {} });
    showMarker();
  },
});

// ブラウザが CSP に従って止めたものを記録する
document.addEventListener('securitypolicyviolation', (event) => {
  notify({ type: 'csp.violation', data: { directive: event.effectiveDirective, blocked: event.blockedURI } });
});

document.addEventListener('DOMContentLoaded', () => {
  findApp(appId).pages?.enhance(document, { emit: (type, data) => notify({ type, data }) });
});
