// IDOR パックの開発用の検証データ。特定の利用者名やメモ ID をハードコードした誤った修正を、
// 共通の出荷前検証で insufficient（攻撃阻止のテストだけが失敗）と判定できることを確かめる（spec §8.1）。配布物には含めない
import { readMemoWith, type ReadMemo } from '../../../apps/memo/hooks';
import type { User } from '../../../apps/memo/model';
import type { PackVerificationData } from '../../../tests/support/verification-data';

/** seed 1 の初期データでの、alice の非公開メモの ID */
export const ALICE_PRIVATE_ID_SEED_1 = 8748;

/** forbid に当たるときだけ断る取得処理。メモの所有者は利用者キーで渡す */
const readUnless =
  (forbid: (memo: { id: number; ownerKey: string }, user: User) => boolean): ReadMemo =>
  (ctx, request) =>
    readMemoWith((memo, user) => {
      const ownerKey = ctx.db.selectValue('SELECT key FROM users WHERE id = ?', [memo.ownerId]) as string;
      const forbidden = forbid({ id: memo.id, ownerKey }, user);
      return { allow: !forbidden, reason: forbidden ? 'ハードコードした条件に当たる' : 'ハードコードした条件の外' };
    })(ctx, request);

export const idorVerification: PackVerificationData = {
  packId: 'idor',
  implementations: {
    // 問い合わせの alice のメモだけを守る
    'idor/wrong-fix-alice-only': {
      hook: 'memo.read.authorize',
      run: readUnless((memo, user) => memo.ownerKey === 'alice' && user.key !== 'alice'),
    },
    // 演習で見た alice の非公開メモの ID だけを守る
    'idor/wrong-fix-fixed-id': {
      hook: 'memo.read.authorize',
      run: readUnless((memo, user) => memo.id === ALICE_PRIVATE_ID_SEED_1 && user.key !== 'alice'),
    },
  },
  candidates: [
    { id: 'wrong-fix-alice-only', apply: [{ hook: 'memo.read.authorize', implementation: 'idor/wrong-fix-alice-only' }], expected: 'insufficient' },
    { id: 'wrong-fix-fixed-id', apply: [{ hook: 'memo.read.authorize', implementation: 'idor/wrong-fix-fixed-id' }], expected: 'insufficient' },
  ],
};
