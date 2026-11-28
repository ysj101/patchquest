// 社内ポータルの教材ロジック。どのリクエストにも、HTTP の応答（ステータス・ヘッダ・HTML）を返す。
// だれの操作かは、演習ハーネスが発行したセッションから決める（この実行方式では Cookie を使えない）
import { isObj, type AppRequest, type AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { HOME, isExternal, withinSite, type PickRedirect } from './hooks';
import { homePage, messagePage, noticePage, redirectTo, signInPage, type Visitor } from './pages';

function visitorOf(ctx: ServerContext): Visitor {
  const signedIn = ctx.principal === null ? undefined : (ctx.db.selectValue('SELECT signed_in FROM users WHERE key = ?', [ctx.principal]) as number | undefined);
  return signedIn === undefined ? { key: null, signedIn: false } : { key: ctx.principal, signedIn: signedIn === 1 };
}

/** 302 を返し、行き先と、それがこのサイトの外かを観測ログに残す。このサイトの中の行き先は、パスだけの形にして返す */
function redirect(ctx: ServerContext, location: string): AppResponse {
  const target = withinSite(location);
  ctx.emit('portal.redirect', { location: target, external: isExternal(target) });
  return redirectTo(target);
}

function setSignedIn(ctx: ServerContext, key: string, signedIn: boolean): void {
  ctx.db.exec({ sql: 'UPDATE users SET signed_in = ? WHERE key = ?', bind: [signedIn ? 1 : 0, key] });
}

function notice(ctx: ServerContext, visitor: Visitor, path: string, idSegment: string): AppResponse {
  // サインインしていなければ、サインインの画面へ送る。もとのページを next で渡し、サインインのあとに戻れるようにする
  if (!visitor.signedIn) return redirect(ctx, `/login?next=${encodeURIComponent(path)}`);
  const found = /^[1-9]\d{0,8}$/.test(idSegment) ? (ctx.db.selectObject('SELECT title, body FROM notices WHERE id = ?', [Number(idSegment)]) as { title: string; body: string } | undefined) : undefined;
  return found ? noticePage(visitor, found) : messagePage(404, 'ページが見つかりません', visitor, 'このお知らせはありません。');
}

function signIn(ctx: ServerContext, visitor: Visitor, body: AppRequest['body']): AppResponse {
  if (visitor.key === null) return messagePage(401, 'サインインできません', visitor, 'だれとしてサインインするかが決まっていません。');
  setSignedIn(ctx, visitor.key, true);
  const next = isObj(body) && typeof body.next === 'string' ? body.next : null;
  // 行き先は交換点（portal.signin.redirect）が決める
  return redirect(ctx, ctx.hook<PickRedirect>('portal.signin.redirect')(next));
}

function get(ctx: ServerContext, visitor: Visitor, path: string, query: string): AppResponse | null {
  const [, resource = '', idSegment, ...rest] = path.split('/');
  if (path === HOME) return homePage(visitor, ctx.db.selectObjects('SELECT id, title FROM notices ORDER BY id') as { id: number; title: string }[]);
  if (path === '/login') return signInPage(visitor, new URLSearchParams(query).get('next'));
  if (resource === 'notices' && idSegment !== undefined && rest.length === 0) return notice(ctx, visitor, path, idSegment);
  return null;
}

function post(ctx: ServerContext, visitor: Visitor, path: string, request: AppRequest): AppResponse | null {
  if (request.method !== 'POST') return null;
  if (path === '/login') return signIn(ctx, visitor, request.body);
  if (path !== '/logout') return null;
  if (visitor.key !== null) setSignedIn(ctx, visitor.key, false);
  return redirect(ctx, HOME);
}

export function handle(ctx: ServerContext, request: AppRequest): AppResponse {
  // 最初の ? より後ろは、値の中に ? があっても、すべてクエリとして読む
  const mark = request.path.indexOf('?');
  const path = mark < 0 ? request.path : request.path.slice(0, mark);
  const query = mark < 0 ? '' : request.path.slice(mark + 1);
  const visitor = visitorOf(ctx);
  const routed = request.method === 'GET' ? get(ctx, visitor, path, query) : post(ctx, visitor, path, request);
  return routed ?? messagePage(404, 'ページが見つかりません', visitor, 'このアドレスにページはありません。');
}
