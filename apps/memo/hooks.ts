// メモアプリが公開する交換点（フック）と、その安全な基準実装
import type { HookDescriptor, ImplementationRegistry } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { emitDecision, findMemo, type Memo, type User } from './model';

export type ReadResult = { status: 'ok'; memo: Memo } | { status: 'unauthenticated' | 'not-found' | 'forbidden' };

/** ID 指定でメモを取得する処理（認可を含む）。契約 1 */
export type ReadMemo = (ctx: ServerContext, request: { id: number; user: User | null }) => ReadResult;

export const HOOKS: HookDescriptor[] = [
  {
    id: 'memo.read.authorize',
    realm: 'server',
    contract: 1,
    baseline: 'memo/read-owner-check',
    description: 'ID 指定でメモを取得する処理。取得してよいかの判断（認可）を含む',
  },
];

const readOwnerCheck: ReadMemo = (ctx, { id, user }) => {
  if (!user) {
    emitDecision(ctx, 'read', null, null, 'deny', 'ログインしていない');
    return { status: 'unauthenticated' };
  }
  const memo = findMemo(ctx.db, id);
  if (!memo) return { status: 'not-found' };
  if (memo.ownerId !== user.id) {
    emitDecision(ctx, 'read', user, memo, 'deny', '所有者ではない');
    return { status: 'forbidden' };
  }
  emitDecision(ctx, 'read', user, memo, 'allow', '所有者である');
  return { status: 'ok', memo };
};

export const BASELINE: ImplementationRegistry = {
  'memo/read-owner-check': { hook: 'memo.read.authorize', run: readOwnerCheck },
};
