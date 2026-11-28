// 掲示板の教材ロジック。リクエストを受けて、ページ（HTML）と応答ヘッダを返す。応答は Service Worker が本物の HTTP 応答にする。
// 主体はセッションから解決する。掲示板のページの応答には、サーバの設定で決めたヘッダを付ける
import { isObj, type AppRequest, type AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { escapeHtml, pageDocument, pageLink } from '../../runtimes/browser/pages/document';
import { ADMIN } from './fixtures';
import { CSP_HEADER, RENDER_HOOK, type RenderComment } from './hooks';
import { HEADER_VALUE_MAX_LENGTH, listComments, responseHeaders, setResponseHeader } from './model';

export const BOARD_ROUTE = '/board';
export const SETTINGS_ROUTE = '/admin/headers';
const STYLESHEET = 'board-pages.css';

const page = (route: string, title: string, body: string): string => pageDocument({ appId: 'board', route, title, stylesheet: STYLESHEET, body });

function viewerLine(ctx: ServerContext): string {
  const viewer = ctx.principal ? `${escapeHtml(ctx.principal)} として見ています` : 'ログインしていません';
  return `<p class="viewer">${viewer}</p>`;
}

/** 掲示板のページ。コメントの本文は、交換点（描画の処理）が HTML に入れる形にする。件数は、ページのスクリプトが数えて書きこむ */
function board(ctx: ServerContext): AppResponse {
  const render = ctx.hook<RenderComment>(RENDER_HOOK);
  const comments = listComments(ctx.db)
    .map((comment) => `<li><span class="author">${escapeHtml(comment.author)}</span><div class="body">${render(comment.body)}</div></li>`)
    .join('\n');
  const settings = ctx.principal === ADMIN ? `<nav><a href="${pageLink(BOARD_ROUTE, SETTINGS_ROUTE)}">管理：応答ヘッダの設定</a></nav>` : '';
  const body = `<header><h1>みんなの掲示板</h1>${viewerLine(ctx)}${settings}</header>
<p id="count" class="count">コメントの数を数えています…</p>
<ul class="comments">
${comments}
</ul>`;
  return { status: 200, headers: responseHeaders(ctx.db), body: page(BOARD_ROUTE, 'みんなの掲示板', body) };
}

const message = (route: string, status: number, title: string, text: string): AppResponse => ({
  status,
  body: page(route, title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p><a href="${pageLink(route, BOARD_ROUTE)}">掲示板へ戻る</a></p>`),
});

/** 応答ヘッダの設定のページ。管理者だけが開ける。ここで決めた値が、掲示板のページの応答に付く */
function settings(ctx: ServerContext, notice = ''): AppResponse {
  const current = responseHeaders(ctx.db)[CSP_HEADER] ?? '';
  const body = `<header><h1>応答ヘッダの設定</h1>${viewerLine(ctx)}</header>
<p>掲示板のページ（${BOARD_ROUTE}）の応答に付けるヘッダを決めます。空にして保存すると、ヘッダを付けません。</p>
${notice ? `<p class="notice" role="alert">${escapeHtml(notice)}</p>` : ''}
<form method="post" action="${pageLink(SETTINGS_ROUTE, SETTINGS_ROUTE)}">
<label for="value">Content-Security-Policy</label>
<input id="value" name="value" value="${escapeHtml(current)}" maxlength="${String(HEADER_VALUE_MAX_LENGTH)}" autocomplete="off" spellcheck="false">
<button type="submit">保存する</button>
</form>
<p>いまの値：${current ? `<code>${escapeHtml(current)}</code>` : '（付けていません）'}</p>
<p><a href="${pageLink(SETTINGS_ROUTE, BOARD_ROUTE)}">掲示板へ戻る</a></p>`;
  return { status: notice ? 400 : 200, body: page(SETTINGS_ROUTE, '応答ヘッダの設定', body) };
}

/** ヘッダの値として使えない入力なら、その理由を返す */
function valueError(value: unknown): string | null {
  if (typeof value !== 'string') return '値を入力してください。';
  if (value.length > HEADER_VALUE_MAX_LENGTH) return `値は ${String(HEADER_VALUE_MAX_LENGTH)} 文字までです。`;
  // ヘッダの値には、改行などの制御文字と、ASCII 以外の文字を入れられない
  return /^[\x20-\x7e]*$/.test(value) ? null : '値に使えるのは、半角の英数字と記号だけです。';
}

function saveSettings(ctx: ServerContext, body: unknown): AppResponse {
  const value = isObj(body) ? body.value : undefined;
  const error = valueError(value);
  if (error !== null) return settings(ctx, error);
  const trimmed = (value as string).trim();
  setResponseHeader(ctx.db, CSP_HEADER, trimmed);
  ctx.emit('headers.changed', { name: 'Content-Security-Policy', value: trimmed === '' ? null : trimmed });
  // 保存したら、設定のページを開き直させる（フォームの送り直しを避ける、よくある作り）
  return { status: 303, headers: { location: SETTINGS_ROUTE }, body: '' };
}

export function handle(ctx: ServerContext, request: AppRequest): AppResponse {
  const path = request.path.split('?')[0] ?? '';
  if (path === BOARD_ROUTE && request.method === 'GET') return board(ctx);
  if (path === SETTINGS_ROUTE && (request.method === 'GET' || request.method === 'POST')) {
    if (ctx.principal !== ADMIN) return message(SETTINGS_ROUTE, 403, 'このページは開けません', '応答ヘッダの設定は、管理者だけが開けます。');
    return request.method === 'GET' ? settings(ctx) : saveSettings(ctx, request.body);
  }
  return message(BOARD_ROUTE, 404, 'ページが見つかりません', `${path} というページはありません。`);
}
