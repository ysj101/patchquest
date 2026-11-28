// 「署名を確かめないトークン」パックの開発用の検証データ。署名を計算し直さない誤った修正を、
// 共通の出荷前検証で insufficient（攻撃阻止のテストだけが失敗）と判定できることを確かめる。配布物には含めない
import { checkTokenWith, hasValidSignature } from '../../../apps/memo/token';
import { fromBase64Url } from '../../../apps/memo/jwt';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const HOOK = 'memo.token.verify';

export const jwtSignatureVerification: PackVerificationData = {
  packId: 'jwt-signature',
  implementations: {
    // 署名の計算のしかたを、トークンのヘッダーに書かれた alg で決める。「署名なし」（none）と書いたトークンは確かめずに通る
    'jwt-signature/wrong-fix-trust-header-alg': {
      hook: HOOK,
      run: checkTokenWith(async (ctx, token) =>
        token.header.alg === 'none' || (await hasValidSignature(ctx, token)) ? { accept: true, reason: 'ヘッダーの alg のとおりに確かめた' } : { accept: false, reason: '署名が合わない' },
      ),
    },
    // 中身に書かれた利用者が実在するかだけを確かめる
    'jwt-signature/wrong-fix-known-user': {
      hook: HOOK,
      run: checkTokenWith((ctx, token) => {
        const { sub } = token.payload;
        const known = typeof sub === 'string' && ctx.db.selectValue('SELECT COUNT(*) FROM users WHERE key = ?', [sub]) === 1;
        return Promise.resolve(known ? { accept: true, reason: '実在する利用者' } : { accept: false, reason: '実在しない利用者' });
      }),
    },
    // 署名が HS256 の長さ（32 バイト）かだけを確かめる
    'jwt-signature/wrong-fix-signature-length': {
      hook: HOOK,
      run: checkTokenWith((_ctx, token) =>
        Promise.resolve(fromBase64Url(token.parts.signature)?.length === 32 ? { accept: true, reason: '署名の長さが合う' } : { accept: false, reason: '署名の長さが合わない' }),
      ),
    },
  },
  candidates: [
    { id: 'wrong-fix-trust-header-alg', apply: [{ hook: HOOK, implementation: 'jwt-signature/wrong-fix-trust-header-alg' }], expected: 'insufficient' },
    { id: 'wrong-fix-known-user', apply: [{ hook: HOOK, implementation: 'jwt-signature/wrong-fix-known-user' }], expected: 'insufficient' },
    { id: 'wrong-fix-signature-length', apply: [{ hook: HOOK, implementation: 'jwt-signature/wrong-fix-signature-length' }], expected: 'insufficient' },
  ],
  answerTerms: ['計算し直', '比べ', 'jwt.verify'],
};
