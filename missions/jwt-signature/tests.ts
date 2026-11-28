// 「署名を確かめないトークン」パックの攻撃の成立条件とテスト。利用者・メモ・トークンはすべて fixture の値で参照し、
// 特定の利用者だけを守る修正を、別の利用者の組み合わせと別の seed で見逃さない
import type { ProbeDef, TestCase } from '../../platform/contract';
import { USERS } from '../../apps/memo/fixtures';
import { ACCEPTED_WITHOUT_VALID_SIGNATURE, TOKEN_MEMOS, memosOf, rejectToken, sendToken, useOwnToken } from '../../apps/memo/token-scenario';

type Owner = (typeof USERS)[number];

const forged = (owner: Owner) => `{{tokens.${owner}.forged}}`;
const unsigned = (owner: Owner) => `{{tokens.${owner}.unsigned}}`;

/**
 * owner を名乗る、署名の合わないトークンで、owner 以外のだれもが owner のメモを取り出せてしまう。
 * detect は、owner 以外の利用者が、署名の合わないトークンで owner のメモを受け取ったやり取り
 */
function forgeToken(owner: Owner): ProbeDef {
  return {
    id: `forge-${owner}-token`,
    title: `${owner} を名乗る、署名の合わないトークンで、別の利用者が ${owner} のメモを取り出せる`,
    steps: USERS.filter((sender) => sender !== owner).map((sender) => sendToken(sender, forged(owner), memosOf(owner), [ACCEPTED_WITHOUT_VALID_SIGNATURE])),
    detect: {
      actor: { not: owner },
      request: TOKEN_MEMOS,
      response: { status: 200, body: [{ path: 'user.id', is: { equals: `{{users.${owner}.id}}` } }] },
      events: [ACCEPTED_WITHOUT_VALID_SIGNATURE],
    },
  };
}

/** どの利用者になりすましても再現とみなせるよう、名乗られる利用者ごとに probe を置く */
export const PROBES: ProbeDef[] = USERS.map(forgeToken);

/** 攻撃阻止のテスト。アプリ共通の memo.token.forged-denied・memo.token.unsigned-denied とあわせて、注入した状態で失敗する */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'jwt-signature.forged.cross-users',
    category: 'security',
    title: 'どの利用者を名乗っても、でたらめな署名のトークンではメモを取り出せない（ログインしていない人が送っても同じ）',
    steps: [rejectToken('alice', forged('bob'), 'bob'), rejectToken('carol', forged('bob'), 'bob'), rejectToken('anonymous', forged('carol'), 'carol')],
  },
  {
    id: 'jwt-signature.unsigned.cross-users',
    category: 'security',
    title: 'どの利用者を名乗っても、「署名なし」と書いたトークンではメモを取り出せない',
    steps: [rejectToken('alice', unsigned('bob'), 'bob'), rejectToken('anonymous', unsigned('carol'), 'carol')],
  },
  {
    id: 'jwt-signature.forged.new-memo',
    category: 'security',
    title: '新しく作られたメモも、書いた人を名乗るでたらめな署名のトークンでは取り出せない',
    steps: [
      {
        kind: 'request',
        as: 'carol',
        request: { method: 'POST', path: '/api/memos', body: { title: '新しい非公開メモ', body: '書いた人だけが取り出せる本文' } },
        expect: { status: 201 },
      },
      sendToken('bob', forged('carol'), { status: [401, 403], body: [{ path: '', is: { notContains: '書いた人だけが取り出せる本文' } }] }),
    ],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'jwt-signature.own.all-users',
    category: 'normal',
    title: 'どの利用者も、自分のトークンで自分のメモを取り出せる',
    steps: [...useOwnToken('bob'), ...useOwnToken('carol')],
  },
  {
    id: 'jwt-signature.own.without-session',
    category: 'normal',
    title: 'ログインしていない別のアプリからも、発行されたトークンを送ればメモを取り出せる',
    steps: useOwnToken('bob', 'anonymous'),
  },
];
