// メモアプリの教材ロジック（サーバの判断をブラウザ内でモデル化したもの、spec §14）。
// 主体はセッションから解決し、リクエストの userId・ownerId などは認証済みの情報として扱わない
import type { AppRequest, AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { BuildSearchQuery, ReadMemo, ValidateTitle } from './hooks';
import { json } from '../shared/http';
import {
  BODY_MAX_LENGTH,
  COMMENT_MAX_LENGTH,
  QUERY_MAX_LENGTH,
  currentUser,
  emitDecision,
  findMemo,
  memoJson,
  type Memo,
  type User,
} from './model';

const UNAUTHENTICATED = json(401, { error: 'ログインが必要です' });

function parseId(segment: string | undefined): number | null {
  return segment && /^[1-9]\d{0,8}$/.test(segment) ? Number(segment) : null;
}

/** 入力検証の失敗を記録し、その応答を返す */
function invalid(ctx: ServerContext, field: string, message: string): AppResponse {
  ctx.emit('validation.failed', { field, message });
  return json(400, { error: message, field });
}

/** 文字列の入力を検証する。max を省くと文字数は見ない。違反があればその応答を返す */
function text(ctx: ServerContext, field: string, value: unknown, label: string, max = Infinity, required = true): string | AppResponse {
  if (typeof value !== 'string' || (required && value.trim() === '')) return invalid(ctx, field, `${label}を入力してください`);
  if ([...value].length > max) return invalid(ctx, field, `${label}は ${max} 文字以内にしてください`);
  return value;
}

/** タイトルと本文の検証。違反があればその応答を返す */
function validate(ctx: ServerContext, body: AppRequest['body']): { title: string; body: string } | AppResponse {
  const input = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  // タイトルの文字数の検証は交換点（memo.title.validate）が受け持つ
  const title = text(ctx, 'title', input.title, 'タイトル');
  if (typeof title !== 'string') return title;
  const checked = ctx.hook<ValidateTitle>('memo.title.validate')(title);
  if (!checked.ok) return invalid(ctx, 'title', checked.message);
  const memoBody = text(ctx, 'body', input.body, '本文', BODY_MAX_LENGTH, false);
  if (typeof memoBody !== 'string') return memoBody;
  return { title, body: memoBody };
}

/** 更新・削除の認可。フックにはせず、回帰テストで守られていることを確かめる */
function authorizeWrite(ctx: ServerContext, action: 'update' | 'delete', user: User, id: number): Memo | AppResponse {
  const memo = findMemo(ctx.db, id);
  if (!memo) return json(404, { error: 'メモが見つかりません' });
  if (memo.ownerId !== user.id) {
    emitDecision(ctx, action, user, memo, 'deny', '所有者ではない');
    return json(403, { error: 'このメモを変更する権限がありません' });
  }
  emitDecision(ctx, action, user, memo, 'allow', '所有者である');
  return memo;
}

const isResponse = (v: object): v is AppResponse => 'status' in v;

function findPage(ctx: ServerContext, idSegment: string): { id: number; title: string; body: string } | undefined {
  const id = parseId(idSegment);
  return id === null ? undefined : (ctx.db.selectObject('SELECT id, title, body FROM pages WHERE id = ?', [id]) as never);
}

const PAGE_NOT_FOUND = json(404, { error: 'ページが見つかりません' });

function listPages(ctx: ServerContext): AppResponse {
  return json(200, { pages: ctx.db.selectObjects('SELECT id, title FROM pages ORDER BY id') as never });
}

/** 共有教材ページとコメント。ログインした利用者なら誰でも読める */
function getPage(ctx: ServerContext, idSegment: string): AppResponse {
  const page = findPage(ctx, idSegment);
  if (!page) return PAGE_NOT_FOUND;
  const comments = ctx.db.selectObjects(
    'SELECT c.id, c.author_id AS authorId, u.name AS authorName, c.body FROM comments c JOIN users u ON u.id = c.author_id WHERE c.page_id = ? ORDER BY c.id',
    [page.id],
  );
  return json(200, { page, comments: comments as never });
}

/** コメントの投稿。投稿者は常にセッションの利用者で、リクエストの authorId は使わない */
function postComment(ctx: ServerContext, req: AppRequest, user: User, idSegment: string): AppResponse {
  const page = findPage(ctx, idSegment);
  if (!page) return PAGE_NOT_FOUND;
  const body = text(ctx, 'body', (req.body as { body?: unknown } | undefined)?.body, 'コメント', COMMENT_MAX_LENGTH);
  if (typeof body !== 'string') return body;
  const created = ctx.db.selectObject('INSERT INTO comments (page_id, author_id, body) VALUES (?, ?, ?) RETURNING id', [page.id, user.id, body]) as { id: number };
  return json(201, { comment: { id: created.id, authorId: user.id, authorName: user.name, body } });
}

/** 自分のメモの検索。クエリはフックが組み立て、ここで実行してクエリ形・バインド値・返却行の所有者を記録する */
function search(ctx: ServerContext, query: string, user: User): AppResponse {
  const q = text(ctx, 'q', (new URLSearchParams(query).get('q') ?? '').trim(), '検索語', QUERY_MAX_LENGTH);
  if (typeof q !== 'string') return q;

  const { sql, bind } = ctx.hook<BuildSearchQuery>('memo.search.query')({ userId: user.id, q });
  let rows: { id: number; ownerId: number; title: string }[];
  try {
    rows = ctx.db.selectObjects(sql, bind) as typeof rows;
  } catch (e) {
    ctx.emit('sql.error', { sql, bind, message: e instanceof Error ? e.message : String(e) });
    return json(400, { error: '検索に失敗しました' });
  }
  // 返却行の所有者は、クエリが返した列名に頼らず、実際のメモの所有者から記録する
  const owners = rows.map((r) => (ctx.db.selectValue('SELECT owner_id FROM memos WHERE id = ?', [r.id]) as number | undefined) ?? null);
  ctx.emit('sql.query', { sql, bind, rows: rows.length, owners: [...new Set(owners)] });
  return json(200, { results: rows.map((r) => ({ id: r.id, ownerId: r.ownerId, title: r.title })) });
}

export function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  const [path, query = ''] = req.path.split('?');
  const [, api, resource, idSegment, sub, ...rest] = path!.split('/');
  if (api !== 'api' || rest.length > 0) return json(404, { error: '見つかりません' });
  const user = currentUser(ctx);

  if (resource === 'me' && idSegment === undefined && req.method === 'GET') {
    return user ? json(200, { user: { id: user.id, key: user.key, name: user.name } }) : UNAUTHENTICATED;
  }
  if (resource === 'pages' || resource === 'search') {
    if (!user) return UNAUTHENTICATED;
    if (resource === 'search' && idSegment === undefined && req.method === 'GET') return search(ctx, query, user);
    if (resource === 'pages' && idSegment === undefined && req.method === 'GET') return listPages(ctx);
    if (resource === 'pages' && idSegment !== undefined && sub === undefined && req.method === 'GET') return getPage(ctx, idSegment);
    if (resource === 'pages' && idSegment !== undefined && sub === 'comments' && req.method === 'POST') return postComment(ctx, req, user, idSegment);
    return json(404, { error: '見つかりません' });
  }
  if (resource !== 'memos' || sub !== undefined) return json(404, { error: '見つかりません' });

  if (idSegment === undefined) {
    if (!user) return UNAUTHENTICATED;
    if (req.method === 'GET') {
      const memos = ctx.db.selectObjects('SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ? ORDER BY id DESC', [user.id]);
      return json(200, { memos: memos as never });
    }
    if (req.method === 'POST') {
      const input = validate(ctx, req.body);
      if (isResponse(input)) return input;
      // 所有者は常にセッションの利用者。リクエストの ownerId は使わない
      const created = ctx.db.selectObject('INSERT INTO memos (owner_id, title, body) VALUES (?, ?, ?) RETURNING id', [user.id, input.title, input.body]) as { id: number };
      return json(201, { memo: memoJson({ id: created.id, ownerId: user.id, ...input }) });
    }
    return json(405, { error: '許可されていない操作です' });
  }

  const id = parseId(idSegment);
  if (id === null) return json(404, { error: 'メモが見つかりません' });

  if (req.method === 'GET') {
    const result = ctx.hook<ReadMemo>('memo.read.authorize')(ctx, { id, user });
    switch (result.status) {
      case 'ok':
        return json(200, { memo: memoJson(result.memo) });
      case 'unauthenticated':
        return UNAUTHENTICATED;
      case 'forbidden':
        return json(403, { error: 'このメモを表示する権限がありません' });
      case 'not-found':
        return json(404, { error: 'メモが見つかりません' });
    }
  }

  if (!user) return UNAUTHENTICATED;
  if (req.method === 'PUT') {
    const memo = authorizeWrite(ctx, 'update', user, id);
    if (isResponse(memo)) return memo;
    const input = validate(ctx, req.body);
    if (isResponse(input)) return input;
    ctx.db.exec({ sql: 'UPDATE memos SET title = ?, body = ? WHERE id = ?', bind: [input.title, input.body, memo.id] });
    return json(200, { memo: memoJson({ ...memo, ...input }) });
  }
  if (req.method === 'DELETE') {
    const memo = authorizeWrite(ctx, 'delete', user, id);
    if (isResponse(memo)) return memo;
    ctx.db.exec({ sql: 'DELETE FROM memos WHERE id = ?', bind: [memo.id] });
    return json(204, null);
  }
  return json(405, { error: '許可されていない操作です' });
}
