// 社内ポータルの画面。サーバが HTML の文書として描き、リンクとフォームだけで動く（文書の中でスクリプトは動かない）。
// リンクとフォームの行き先は、文書の置き場所からの相対で書く（置き場所は、配信する側が base で入れる）
import type { AppResponse } from '../../platform/contract';
import type { HttpBody } from '../../runtimes/browser/http/mount';
import { esc, sentenceHtml } from '../shared/html';

const STYLE = `
  :root { color-scheme: light; font-family: system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif; line-height: 1.6; }
  body { margin: 0; padding: 16px; background: #fff; color: #1d2129; }
  header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid #d7d9de; }
  header form { display: flex; gap: 8px; align-items: center; }
  h1 { font-size: 1.3rem; line-height: 1.3; margin: 16px 0 12px; }
  a { color: #2457c5; }
  button { font: inherit; border: 1px solid #d7d9de; border-radius: 6px; background: #f6f7f9; padding: 6px 12px; cursor: pointer; }
  button.primary { background: #2457c5; border-color: #2457c5; color: #fff; }
  a:focus-visible, button:focus-visible { outline: 3px solid #2457c5; outline-offset: 2px; }
  .site { font-weight: 700; color: inherit; text-decoration: none; }
  .muted { color: #5b6270; font-size: 0.9rem; }
  .card { border: 1px solid #d7d9de; border-radius: 8px; padding: 12px 16px; }
`;

/** アプリの中のパス（/ で始まる）を、文書の置き場所からの相対アドレスにする */
const to = (path: string): string => (path === '/' ? './' : esc(path.slice(1)));

/** だれがこのブラウザを使っていて、サインインしているか */
export interface Visitor {
  /** 演習の画面で選んだ利用者。未ログインは null */
  key: string | null;
  signedIn: boolean;
}

function account(visitor: Visitor): string {
  if (visitor.key === null) return '<span class="muted">利用者を選んでいません</span>';
  if (!visitor.signedIn) return `<a href="${to('/login')}">サインイン</a>`;
  return `<form method="post" action="${to('/logout')}"><span>${esc(visitor.key)} さん</span><button>サインアウト</button></form>`;
}

function html(status: number, title: string, visitor: Visitor, main: string): AppResponse {
  const document = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}｜社内ポータル</title><style>${STYLE}</style></head><body><header><a class="site" href="${to('/')}">社内ポータル</a>${account(visitor)}</header><main><h1>${esc(title)}</h1>${main}</main></body></html>`;
  return { status, body: { headers: { 'content-type': 'text/html; charset=utf-8' }, html: document } satisfies HttpBody };
}

/** 本文のない 302 の応答。ブラウザは Location のアドレスへ移動する */
export function redirectTo(location: string): AppResponse {
  return { status: 302, body: { headers: { location }, html: '' } satisfies HttpBody };
}

const noticePath = (id: number): string => `/notices/${id}`;

export function homePage(visitor: Visitor, notices: { id: number; title: string }[]): AppResponse {
  const items = notices.map((notice) => `<li><a href="${to(noticePath(notice.id))}">${esc(notice.title)}</a></li>`).join('');
  return html(200, 'お知らせ', visitor, `<p class="muted">${sentenceHtml('お知らせを読むには、サインインが要ります。')}</p><ul>${items}</ul>`);
}

export function noticePage(visitor: Visitor, notice: { title: string; body: string }): AppResponse {
  return html(200, notice.title, visitor, `<p class="card">${esc(notice.body)}</p><p><a href="${to('/')}">お知らせの一覧へ戻る</a></p>`);
}

/** サインインの画面。next（サインインのあとの行き先）があれば、フォームに入れて一緒に送る */
export function signInPage(visitor: Visitor, next: string | null): AppResponse {
  if (visitor.key === null) return html(200, 'サインイン', visitor, `<p>${sentenceHtml('だれとしてサインインするかが決まっていません。演習の画面の「表示する利用者」で、利用者を選んでください。')}</p>`);
  const hidden = next === null ? '' : `<input type="hidden" name="next" value="${esc(next)}">`;
  const lead = sentenceHtml(next === null ? '続けるには、サインインしてください。' : '続けるには、サインインしてください。サインインのあとは、もとのページへ戻ります。');
  return html(
    200,
    'サインイン',
    visitor,
    `<p>${lead}</p><form method="post" action="${to('/login')}">${hidden}<button class="primary">${esc(visitor.key)} としてサインインする</button></form><p class="muted">${sentenceHtml('この教材では、パスワードの入力を省いています。')}</p>`,
  );
}

export function messagePage(status: number, title: string, visitor: Visitor, message: string): AppResponse {
  return html(status, title, visitor, `<p>${sentenceHtml(message)}</p><p><a href="${to('/')}">お知らせの一覧へ戻る</a></p>`);
}
