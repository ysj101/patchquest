// オープンリダイレクトのパックの実装。注入する脆弱な実装と、足りない対策・ふだんの使い方を壊す対策の実装（正しい対策は教材アプリの基準実装を使う）
import type { ImplementationRegistry } from '../../platform/contract';
import { HOME, type PickRedirect } from '../../apps/portal/hooks';

const HOOK = 'portal.signin.redirect';

/** 注入する脆弱な実装：渡された行き先を、確かめずにそのまま返す */
const unchecked: PickRedirect = (next) => next ?? HOME;

/** 対策（足りない）：1 文字目が / かだけを見る。// や /\ で始まる値は、ブラウザが外のサイトとして読むのに通る */
const prefixSlash: PickRedirect = (next) => (next?.startsWith('/') ? next : HOME);

/** 対策（ふだんの使い方が壊れる）：行き先を使わず、いつもトップへ送る。開こうとしていたページへ戻れなくなる */
const alwaysHome: PickRedirect = () => HOME;

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'open-redirect/unchecked': { hook: HOOK, run: unchecked },
  'open-redirect/prefix-slash': { hook: HOOK, run: prefixSlash },
  'open-redirect/always-home': { hook: HOOK, run: alwaysHome },
};
