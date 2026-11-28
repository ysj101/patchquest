// オープンリダイレクトのパックの攻撃の成立条件とテスト。外のサイトへ移動させたかは、教材アプリが記録した応答の行き先（観測ログの「リダイレクト」）で判定する
import type { ProbeDef, TestCase } from '../../platform/contract';

/** 攻撃者が用意した偽のサイトという設定の、架空のアドレス（.example は予約済みで、実在しない） */
export const FAKE_SITE = 'https://evil.example/login';

const EXTERNAL = [{ path: 'external', is: { equals: true } }];

export const PROBES: ProbeDef[] = [
  {
    id: 'external-redirect',
    title: 'サインインのあと、next に書いた外のサイトへ移動させる',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'POST', path: '/login', body: { next: FAKE_SITE } },
        expect: { status: 302, body: [{ path: 'headers.location', is: { equals: FAKE_SITE } }] },
        events: [{ type: 'portal.redirect', where: EXTERNAL }],
      },
    ],
    // だれのサインインでも、どの外のサイトでも、応答が外へ移動させたら再現とみなす
    detect: { request: { method: 'POST', path: '/login' }, response: { status: 302 }, events: [{ type: 'portal.redirect', where: EXTERNAL }] },
  },
];

/** 攻撃阻止のテスト。アプリ共通の portal.redirect.* とあわせて、注入した状態で失敗する */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'open-redirect.lookalike',
    category: 'security',
    title: 'このサイトのアドレスで始まる、別のサイトのアドレスへも移動させない',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'POST', path: '/login', body: { next: 'https://portal.example.attacker.example/login' } },
        expect: { status: [302, 303, 400], body: [{ path: 'headers.location', is: { notContains: 'attacker.example' } }] },
        events: [{ type: 'portal.redirect', where: EXTERNAL, presence: 'absent' }],
      },
    ],
  },
];

export const CASES: TestCase[] = [...TARGET_CASES];
