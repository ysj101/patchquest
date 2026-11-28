// ログイントークンの、アプリ共通のテストと、課題パックと共用する手順の部品。トークンは fixture の値か、発行して取り出した値で参照する
import type { ActorKey, EventExpectation, ResponseExpectation, Step, TestCase } from '../../platform/contract';

/** トークンでメモを取り出す要求 */
export const TOKEN_MEMOS = { method: 'POST', path: '/api/token/memos' } as const;

/** 発行したトークンを指すテンプレート（issueToken のあとの手順で使う） */
export const ISSUED_TOKEN = '{{capture.token}}';

/** 署名が鍵で計算した値と合わないトークンを、受け付けた記録 */
export const ACCEPTED_WITHOUT_VALID_SIGNATURE: EventExpectation = {
  type: 'token.checked',
  where: [
    { path: 'decision', is: { equals: 'accept' } },
    { path: 'signatureValid', is: { equals: false } },
  ],
};

/** actor が自分のトークンを発行し、{{capture.token}} に取り出す */
export const issueToken = (actor: ActorKey): Step => ({
  kind: 'request',
  as: actor,
  request: { method: 'POST', path: '/api/token' },
  expect: { status: 201, body: [{ path: 'token', is: { minLength: 1 } }] },
  capture: { token: 'token' },
});

/** sender が token を送って、メモを取り出す */
export const sendToken = (sender: ActorKey, token: string, expect: ResponseExpectation, events?: EventExpectation[]): Step => ({
  kind: 'request',
  as: sender,
  request: { ...TOKEN_MEMOS, body: { token } },
  expect,
  ...(events && { events }),
});

/** owner のメモが、非公開メモの本文まで返る */
export const memosOf = (owner: string): ResponseExpectation => ({
  status: 200,
  body: [
    { path: 'user.id', is: { equals: `{{users.${owner}.id}}` } },
    { path: 'memos.*.ownerId', is: { equals: `{{users.${owner}.id}}` } },
    { path: '', is: { contains: `{{memos.${owner}.private.body}}` } },
  ],
});

/** owner を名乗るトークンを、メモを返さずに断る。署名の合わないトークンを受け付けた記録も残らない */
export const rejectToken = (sender: ActorKey, token: string, owner: string): Step =>
  sendToken(sender, token, { status: [401, 403], body: [{ path: '', is: { notContains: `{{memos.${owner}.private.body}}` } }] }, [
    { ...ACCEPTED_WITHOUT_VALID_SIGNATURE, presence: 'absent' },
  ]);

/** owner が自分のトークンを発行し、sender がそれを送って owner のメモを受け取る */
export const useOwnToken = (owner: string, sender: ActorKey = owner): Step[] => [issueToken(owner), sendToken(sender, ISSUED_TOKEN, memosOf(owner))];

/** アプリ共通のテスト（ログイントークン）。安全な基準状態 S ではすべて通る */
export const TOKEN_TESTS: TestCase[] = [
  {
    id: 'memo.token.own',
    category: 'normal',
    title: '発行したログイントークンで、自分のメモを取り出せる',
    steps: useOwnToken('alice'),
  },
  {
    id: 'memo.token.forged-denied',
    category: 'security',
    title: '鍵を知らずに作ったトークン（中身は別の利用者、署名はでたらめ）では、メモを取り出せない',
    steps: [rejectToken('bob', '{{tokens.alice.forged}}', 'alice')],
  },
  {
    id: 'memo.token.unsigned-denied',
    category: 'security',
    title: '「署名なし」（alg: none）と書いたトークンでは、メモを取り出せない',
    steps: [rejectToken('bob', '{{tokens.alice.unsigned}}', 'alice')],
  },
  {
    id: 'memo.token.malformed-denied',
    category: 'security',
    title: 'トークンがない・トークンの形でない要求は断り、未ログインではトークンを発行しない',
    steps: [
      { kind: 'request', as: 'alice', request: { ...TOKEN_MEMOS }, expect: { status: 401 } },
      { kind: 'request', as: 'alice', request: { ...TOKEN_MEMOS, body: { token: 'これはトークンではない' } }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'POST', path: '/api/token' }, expect: { status: 401 } },
    ],
  },
];
