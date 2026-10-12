// メモアプリの教材ロジックで共有する型と小さな処理
import type { JsonValue } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { Database } from '../../runtimes/browser/sqlite';

export interface User {
  id: number;
  key: string;
  name: string;
}

export interface Memo {
  id: number;
  ownerId: number;
  title: string;
  body: string;
}

export const TITLE_MAX_LENGTH = 40;
export const BODY_MAX_LENGTH = 1000;
export const COMMENT_MAX_LENGTH = 500;
export const QUERY_MAX_LENGTH = 100;

/** 文字数の上限を超えていれば、利用者に示す説明を返す。文字数はコードポイントで数える */
export function lengthError(label: string, value: string, max: number): string | null {
  return [...value].length > max ? `${label}は ${max} 文字以内にしてください` : null;
}

/** セッションから解決した主体（利用者キー）を、利用者の行へ対応付ける */
export function currentUser(ctx: ServerContext): User | null {
  if (!ctx.principal) return null;
  return (ctx.db.selectObject('SELECT id, key, name FROM users WHERE key = ?', [ctx.principal]) as User | undefined) ?? null;
}

export function findMemo(db: Database, id: number): Memo | null {
  return (
    (db.selectObject('SELECT id, owner_id AS ownerId, title, body FROM memos WHERE id = ?', [id]) as Memo | undefined) ?? null
  );
}

export const memoJson = (memo: Memo): JsonValue => ({ id: memo.id, ownerId: memo.ownerId, title: memo.title, body: memo.body });

/** 認可の判断を観測イベントとして記録する（調査パネルの認可トレース、spec §10） */
export function emitDecision(
  ctx: ServerContext,
  action: 'read' | 'update' | 'delete',
  user: User | null,
  memo: Memo | null,
  decision: 'allow' | 'deny',
  reason: string,
): void {
  ctx.emit('authz.decision', {
    action,
    subject: user?.id ?? null,
    resource: memo?.id ?? null,
    owner: memo?.ownerId ?? null,
    decision,
    reason,
  });
}
