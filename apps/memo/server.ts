// メモアプリの教材ロジック（サーバの判断をブラウザ内でモデル化したもの、spec §14）。
// 主体はセッションから解決し、リクエストの userId・ownerId などは認証済みの情報として扱わない
import type { AppRequest, AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { BuildSearchQuery, ReadMemo } from './hooks';
import { json } from '../shared/http';
import {
  BODY_MAX_LENGTH,
  COMMENT_MAX_LENGTH,
  QUERY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
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

/** タイトルと本文の検証。違反があればその応答を返す */
function validate(ctx: ServerContext, body: AppRequest['body']): { title: string; body: string } | AppResponse {
  const input = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const { title, body: text } = input;
  const fail = (field: string, message: string) => {
    ctx.emit('validation.failed', { field, message });
    return json(400, { error: message, field });
  };
  if (typeof title !== 'string' || title.trim() === '') return fail('title', 'タイトルを入力してください');
  if ([...title].length > TITLE_MAX_LENGTH) return fail('title', `タイトルは ${TITLE_MAX_LENGTH} 文字以内にしてください`);
  if (typeof text !== 'string') return fail('body', '本文を入力してください');
  if ([...text].length > BODY_MAX_LENGTH) return fail('body', `本文は ${BODY_MAX_LENGTH} 文字以内にしてください`);
  return { title, body: text };
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

/** 共有教材ページ。ログインした利用者なら誰でも読め、コメントの投稿者は常にセッションの利用者 */
function pages(ctx: ServerContext, req: AppRequest, user: User, idSegment: string | undefined, sub: string | undefined): AppResponse {
  if (idSegment === undefined) {
    if (req.method !== 'GET') return json(405, { error: '許可されていない操作です' });
    return json(200, { pages: ctx.db.selectObjects('SELECT id, title FROM pages ORDER BY id') as never });
  }
  const id = parseId(idSegment);
  const page = id === null ? undefined : ctx.db.selectObject('SELECT id, title, body FROM pages WHERE id = ?', [id]);
  if (!page) return json(404, { error: 'ページが見つかりません' });

  if (sub === undefined && req.method === 'GET') {
    const comments = ctx.db.selectObjects(
      'SELECT c.id, c.author_id AS authorId, u.name AS authorName, c.body FROM comments c JOIN users u ON u.id = c.author_id WHERE c.page_id = ? ORDER BY c.id',
      [page.id as number],
    );
    return json(200, { page: page as never, comments: comments as never });
  }
  if (sub === 'comments' && req.method === 'POST') {
    const body = (req.body as { body?: unknown } | undefined)?.body;
    if (typeof body !== 'string' || body.trim() === '') return json(400, { error: 'コメントを入力してください', field: 'body' });
    if ([...body].length > COMMENT_MAX_LENGTH) return json(400, { error: `コメントは ${COMMENT_MAX_LENGTH} 文字以内にしてください`, field: 'body' });
    const created = ctx.db.selectObject('INSERT INTO comments (page_id, author_id, body) VALUES (?, ?, ?) RETURNING id', [page.id as number, user.id, body]) as { id: number };
    return json(201, { comment: { id: created.id, authorId: user.id, authorName: user.name, body } });
  }
  return json(405, { error: '許可されていない操作です' });
}

/** 自分のメモの検索。クエリはフックが組み立て、ここで実行してクエリ形・バインド値・返却行の所有者を記録する */
function search(ctx: ServerContext, req: AppRequest, user: User): AppResponse {
  if (req.method !== 'GET') return json(405, { error: '許可されていない操作です' });
  const q = (new URLSearchParams(req.path.split('?')[1] ?? '').get('q') ?? '').trim();
  if (q === '') return json(400, { error: '検索語を入力してください', field: 'q' });
  if ([...q].length > QUERY_MAX_LENGTH) return json(400, { error: `検索語は ${QUERY_MAX_LENGTH} 文字以内にしてください`, field: 'q' });

  const { sql, bind } = ctx.hook<BuildSearchQuery>('memo.search.query')({ userId: user.id, q });
  let rows: { id: number; ownerId: number; title: string }[];
  try {
    rows = ctx.db.selectObjects(sql, bind) as typeof rows;
  } catch (e) {
    ctx.emit('sql.error', { sql, bind, message: e instanceof Error ? e.message : String(e) });
    return json(400, { error: '検索に失敗しました' });
  }
  ctx.emit('sql.query', { sql, bind, rows: rows.length, owners: [...new Set(rows.map((r) => r.ownerId ?? null))] });
  return json(200, { results: rows.map((r) => ({ id: r.id, ownerId: r.ownerId, title: r.title })) });
}

export function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  const [, api, resource, idSegment, sub, ...rest] = req.path.split('?')[0]!.split('/');
  if (api !== 'api' || rest.length > 0) return json(404, { error: '見つかりません' });
  const user = currentUser(ctx);

  if (resource === 'me' && idSegment === undefined && req.method === 'GET') {
    return user ? json(200, { user: { id: user.id, key: user.key, name: user.name } }) : UNAUTHENTICATED;
  }
  if (resource === 'pages') return user ? pages(ctx, req, user, idSegment, sub) : UNAUTHENTICATED;
  if (resource === 'search' && idSegment === undefined) return user ? search(ctx, req, user) : UNAUTHENTICATED;
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
