// IDOR パックの実装。注入する脆弱な実装と、不十分・正常系を壊す対策の実装（正しい対策は教材アプリの基準実装を使う）
import type { ImplementationRegistry } from '../../platform/contract';
import type { PickNeighbors, ReadMemo, ReadResult } from '../../apps/memo/hooks';
import { emitDecision, findMemo, type Memo, type User } from '../../apps/memo/model';

/** ログインの有無と、メモがあるかだけを確かめる。所有者は照合しない */
function lookup(...[ctx, { id, user }]: Parameters<ReadMemo>): ReadResult | { memo: Memo; user: User } {
  if (!user) {
    emitDecision(ctx, 'read', null, null, 'deny', 'ログインしていない');
    return { status: 'unauthenticated' };
  }
  const memo = findMemo(ctx.db, id);
  return memo ? { memo, user } : { status: 'not-found' };
}

/** 注入する脆弱な実装：ログインしていれば、誰のメモでも ID 指定で返す */
const readWithoutOwnerCheck: ReadMemo = (ctx, request) => {
  const found = lookup(ctx, request);
  if ('status' in found) return found;
  emitDecision(ctx, 'read', found.user, found.memo, 'allow', 'ログインしている');
  return { status: 'ok', memo: found.memo };
};

/** 対策（正常系が壊れる）：ID 指定の取得をすべて断る。所有者の取得もできなくなる */
const readDenyAll: ReadMemo = (ctx, request) => {
  const found = lookup(ctx, request);
  if ('status' in found) return found;
  emitDecision(ctx, 'read', found.user, found.memo, 'deny', 'ID 指定の取得をすべて断る');
  return { status: 'forbidden' };
};

/** 注入する脆弱な画面：前後の移動先を番号の隣で決める。他人のメモへのリンクも出る */
const neighborsByNumber: PickNeighbors = ({ id }) => ({ prev: id - 1, next: id + 1 });

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'idor/read-without-owner-check': { hook: 'memo.read.authorize', run: readWithoutOwnerCheck },
  'idor/read-deny-all': { hook: 'memo.read.authorize', run: readDenyAll },
  'idor/neighbors-by-number': { hook: 'memo.detail.neighbors', run: neighborsByNumber },
};
