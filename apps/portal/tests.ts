// 社内ポータル共通のテスト。安全な基準状態 S ではすべて通る（spec A01）。
// お知らせの番号と題名は fixture の値（{{キー}}）で参照し、複数の seed で同じテストが通るようにする
import type { ActorKey, JsonValue, Step, TestCase } from '../../platform/contract';

const NOTICE = '/notices/{{notices.second.id}}';
const SIGN_IN_FOR_NOTICE = '/login?next=%2Fnotices%2F{{notices.second.id}}';

const locationIs = (location: string) => [{ path: 'headers.location', is: { equals: location } }];
const htmlHas = (text: string) => [{ path: 'html', is: { contains: text } }];

/** サインインのフォームを送る。next は、サインインの画面に渡された行き先 */
const signIn = (as: ActorKey, body: JsonValue, expect: Extract<Step, { kind: 'request' }>['expect']): Step => ({
  kind: 'request',
  as,
  request: { method: 'POST', path: '/login', body },
  expect,
});

/** next に外のサイトを指す値を渡しても、応答が外のサイトへ移動させない（断るか、このサイトの中へ送る） */
const staysInside = (id: string, title: string, next: string): TestCase => ({
  id,
  category: 'security',
  title,
  steps: [
    {
      kind: 'request',
      as: 'bob',
      request: { method: 'POST', path: '/login', body: { next } },
      // Location の中身は、不合格のときに実際の行き先を見せるために確かめる。外のサイトかどうかは、観測した行き先の判定（external）で決める
      expect: { status: [302, 303, 400], body: [{ path: 'headers.location', is: { notContains: 'evil.example' } }] },
      events: [{ type: 'portal.redirect', where: [{ path: 'external', is: { equals: true } }], presence: 'absent' }],
    },
  ],
});

export const PORTAL_TESTS: TestCase[] = [
  // 正常系
  {
    id: 'portal.home',
    category: 'normal',
    title: 'サインインしていなくても、お知らせの一覧は見える',
    steps: [{ kind: 'request', as: 'anonymous', request: { method: 'GET', path: '/' }, expect: { status: 200, body: htmlHas('{{notices.first.title}}') } }],
  },
  {
    id: 'portal.notice.asks-signin',
    category: 'normal',
    title: 'サインインしていない人がお知らせを開くと、もとのページを覚えてサインインの画面へ送る',
    steps: [{ kind: 'request', as: 'bob', request: { method: 'GET', path: NOTICE }, expect: { status: 302, body: locationIs(SIGN_IN_FOR_NOTICE) } }],
  },
  {
    id: 'portal.signin.returns',
    category: 'normal',
    title: 'サインインのあと、開こうとしていたお知らせへ戻れる',
    steps: [
      { kind: 'request', as: 'bob', request: { method: 'GET', path: SIGN_IN_FOR_NOTICE }, expect: { status: 200, body: htmlHas('name="next" value="/notices/{{notices.second.id}}"') } },
      signIn('bob', { next: NOTICE }, { status: 302, body: locationIs(NOTICE) }),
      { kind: 'request', as: 'bob', request: { method: 'GET', path: NOTICE }, expect: { status: 200, body: htmlHas('{{notices.second.title}}') } },
    ],
  },
  {
    id: 'portal.signin.keeps-query',
    category: 'normal',
    title: 'サインインのあとの行き先は、? より後ろも含めてそのまま戻る',
    steps: [
      { kind: 'request', as: 'alice', request: { method: 'GET', path: '/login?next=/?from=mail' }, expect: { status: 200, body: htmlHas('name="next" value="/?from=mail"') } },
      signIn('alice', { next: '/?from=mail' }, { status: 302, body: locationIs('/?from=mail') }),
    ],
  },
  {
    id: 'portal.signin.home',
    category: 'normal',
    title: '行き先がなければ、サインインのあとはトップへ送る',
    steps: [
      signIn('alice', {}, { status: 302, body: locationIs('/') }),
      { kind: 'request', as: 'alice', request: { method: 'GET', path: '/' }, expect: { status: 200, body: htmlHas('alice さん') } },
    ],
  },
  {
    id: 'portal.signout',
    category: 'normal',
    title: 'サインアウトすると、お知らせを開くのにもう一度サインインが要る',
    steps: [
      signIn('bob', {}, { status: 302 }),
      { kind: 'request', as: 'bob', request: { method: 'POST', path: '/logout' }, expect: { status: 302, body: locationIs('/') } },
      { kind: 'request', as: 'bob', request: { method: 'GET', path: NOTICE }, expect: { status: 302, body: locationIs(SIGN_IN_FOR_NOTICE) } },
    ],
  },
  {
    id: 'portal.missing',
    category: 'normal',
    title: 'ないお知らせ・ないアドレスは 404 で知らせる',
    steps: [
      signIn('bob', {}, { status: 302 }),
      { kind: 'request', as: 'bob', request: { method: 'GET', path: '/notices/{{notices.missing.id}}' }, expect: { status: 404 } },
      { kind: 'request', as: 'bob', request: { method: 'GET', path: '/nowhere' }, expect: { status: 404 } },
    ],
  },
  // セキュリティ
  staysInside('portal.redirect.absolute', 'サインインのあと、外のサイトのアドレス（https://…）へは移動させない', 'https://evil.example/login'),
  staysInside('portal.redirect.scheme-relative', 'サインインのあと、// で始まる外のサイトのアドレスへは移動させない', '//evil.example/login'),
  staysInside('portal.redirect.backslash', 'サインインのあと、/\\ で始まる外のサイトのアドレスへは移動させない', '/\\evil.example/login'),
  {
    id: 'portal.signin.anonymous',
    category: 'security',
    title: '利用者が決まっていないサインインは断る',
    steps: [
      { kind: 'request', as: 'anonymous', request: { method: 'POST', path: '/login', body: {} }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'GET', path: NOTICE }, expect: { status: 302, body: locationIs(SIGN_IN_FOR_NOTICE) } },
    ],
  },
];
