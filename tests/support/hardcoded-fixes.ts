// 特定の利用者名やメモ ID をハードコードした、IDOR の誤った修正。IDOR パックのテストがこれらを
// 攻撃阻止の失敗として見逃さないことを確かめる（spec §8.1）。配布物には含めない
import type { ImplementationRegistry } from '../../platform/contract';
import type { ReadMemo } from '../../apps/memo/hooks';
import { findMemo } from '../../apps/memo/model';

/** seed 1 の初期データでの、alice の非公開メモの ID */
export const ALICE_PRIVATE_ID_SEED_1 = 8748;

/** 守る条件だけを差し替えた取得処理。ログインと存在は確かめる */
const readUnless =
  (forbid: (memo: { id: number; ownerKey: string }, userKey: string) => boolean): ReadMemo =>
  (ctx, { id, user }) => {
    if (!user) return { status: 'unauthenticated' };
    const memo = findMemo(ctx.db, id);
    if (!memo) return { status: 'not-found' };
    const ownerKey = ctx.db.selectValue('SELECT key FROM users WHERE id = ?', [memo.ownerId]) as string;
    return forbid({ id, ownerKey }, user.key) ? { status: 'forbidden' } : { status: 'ok', memo };
  };

export const HARDCODED_FIXES: ImplementationRegistry = {
  // 問い合わせの alice のメモだけを守る
  'test-pack/memo-protect-alice-only': {
    hook: 'memo.read.authorize',
    run: readUnless((memo, userKey) => memo.ownerKey === 'alice' && userKey !== 'alice'),
  },
  // 演習で見た alice の非公開メモの ID だけを守る
  'test-pack/memo-protect-fixed-id': {
    hook: 'memo.read.authorize',
    run: readUnless((memo, userKey) => memo.id === ALICE_PRIVATE_ID_SEED_1 && userKey !== 'alice'),
  },
};
