// 社内ポータルが公開する交換点（フック）と、その安全な基準実装
import type { HookDescriptor, ImplementationRegistry } from '../../platform/contract';

/** このポータルが公開されているアドレス（教材の設定）。行き先がこのサイトの中か外かを、ここを基準に決める */
export const SITE_ORIGIN = 'https://portal.example';
export const HOME = '/';

/**
 * サインインのあとの行き先を決める処理。next は、サインインの画面へ渡された値（なければ null）。
 * 返した値を、教材ロジックが応答の Location ヘッダに入れる。契約 1
 */
export type PickRedirect = (next: string | null) => string;

/**
 * 行き先を、ブラウザと同じ読み方（URL の解析）で、このサイトのアドレスとして読む。読めない値は null。
 * ブラウザは // や /\ で始まる値を別のサイトのアドレスとして読むので、文字の並びではなく、読んだ結果で判断する
 */
function resolve(location: string): URL | null {
  return URL.canParse(location, SITE_ORIGIN) ? new URL(location, SITE_ORIGIN) : null;
}

/**
 * ブラウザがこの Location に従うと、このサイトの外へ出るか。http・https 以外のアドレス（javascript: など）は、
 * ブラウザがリダイレクトの行き先として受け付けないので、外への移動には数えない
 */
export function isExternal(location: string): boolean {
  const target = resolve(location);
  return target !== null && /^https?:$/.test(target.protocol) && target.origin !== SITE_ORIGIN;
}

/** このサイトの中の行き先を、パスだけの形にする。外の行き先と読めない値は、そのまま返す */
export function withinSite(location: string): string {
  const target = resolve(location);
  return target?.origin === SITE_ORIGIN ? `${target.pathname}${target.search}` : location;
}

/** 基準実装：行き先がこのサイトの中のときだけ従う。外のサイトと読めない値は、トップへ送る */
export const redirectSameSite: PickRedirect = (next) => (next !== null && resolve(next)?.origin === SITE_ORIGIN ? next : HOME);

export const HOOKS: HookDescriptor[] = [
  {
    id: 'portal.signin.redirect',
    realm: 'server',
    contract: 1,
    baseline: 'portal/redirect-same-site',
    description: 'サインインのあとの行き先（応答の Location）を決める処理',
  },
];

export const BASELINE: ImplementationRegistry = {
  'portal/redirect-same-site': { hook: 'portal.signin.redirect', run: redirectSameSite },
};
