// オープンリダイレクトのパックの開発用の検証データ。文字の並びだけを見る誤った修正を、
// 共通の出荷前検証で insufficient（攻撃阻止のテストだけが失敗）と判定できることを確かめる。配布物には含めない
import { HOME, SITE_ORIGIN, type PickRedirect } from '../../../apps/portal/hooks';
import type { PackVerificationData } from '../../../tests/support/verification-data';

const HOOK = 'portal.signin.redirect';

/** 問い合わせに出てきた偽のサイトの名前だけを断る。ほかの外のサイトへは移動させてしまう */
const blockKnownHost: PickRedirect = (next) => (next === null || next.includes('evil.example') ? HOME : next);

/** このサイトのアドレスで始まるか、/ で始まって // ではない値に従う。このサイトの名前で始まる別のサイトと、/\ で始まる値を通してしまう */
const prefixOnly: PickRedirect = (next) => (next !== null && (next.startsWith(SITE_ORIGIN) || /^\/(?!\/)/.test(next)) ? next : HOME);

export const openRedirectVerification: PackVerificationData = {
  packId: 'open-redirect',
  implementations: {
    'open-redirect/wrong-fix-known-host': { hook: HOOK, run: blockKnownHost },
    'open-redirect/wrong-fix-prefix-only': { hook: HOOK, run: prefixOnly },
  },
  // 直し方（行き先の読み方と、従う条件）。調べ方には書かない
  answerTerms: ['URL として読', 'このサイトの中のときだけ'],
  candidates: [
    { id: 'wrong-fix-known-host', apply: [{ hook: HOOK, implementation: 'open-redirect/wrong-fix-known-host' }], expected: 'insufficient' },
    { id: 'wrong-fix-prefix-only', apply: [{ hook: HOOK, implementation: 'open-redirect/wrong-fix-prefix-only' }], expected: 'insufficient' },
  ],
};
