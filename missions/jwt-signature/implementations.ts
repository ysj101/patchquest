// 「署名を確かめないトークン」パックの実装。注入する脆弱な実装と、不十分な対策・正常系を壊す対策。
// 正しい対策（鍵で署名を計算し直して比べる）は、教材アプリの基準実装 memo/token-verify-signature を使う
import type { ImplementationRegistry } from '../../platform/contract';
import { checkTokenWith } from '../../apps/memo/token';

/** 注入する脆弱な実装：トークンの中身を読むだけで、署名を確かめずに受け付ける */
const decodeOnly = checkTokenWith(() => Promise.resolve({ accept: true, reason: '中身を読んだだけ' }));

/** 対策（不十分）：署名の部分が付いているかだけを見る。値が鍵で計算したものと合うかは確かめない */
const requireSignature = checkTokenWith((_ctx, token) =>
  Promise.resolve(
    token.header.alg === 'none' || token.parts.signature === '' ? { accept: false, reason: '署名が付いていない' } : { accept: true, reason: '署名が付いている' },
  ),
);

/** 対策（正常系が壊れる）：トークンをすべて断る。本人も自分のメモを取り出せなくなる */
const rejectAll = checkTokenWith(() => Promise.resolve({ accept: false, reason: 'トークンをすべて断る' }));

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'jwt-signature/decode-only': { hook: 'memo.token.verify', run: decodeOnly },
  'jwt-signature/require-signature': { hook: 'memo.token.verify', run: requireSignature },
  'jwt-signature/reject-all': { hook: 'memo.token.verify', run: rejectAll },
};
