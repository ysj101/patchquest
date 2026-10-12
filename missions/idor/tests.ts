// IDOR パックの攻撃の成立条件とテスト。利用者・メモはすべて fixture の値で参照し、
// 特定の利用者名やメモ ID だけを守るハードコードした修正を、別の利用者の組み合わせと別の seed で見逃さない
import type { ActorKey, ProbeDef, ResponseExpectation, Step, TestCase } from '../../platform/contract';
import { USERS } from '../../apps/memo/fixtures';

type Owner = (typeof USERS)[number];

const memoPath = (owner: Owner, memo: 'private' | 'other') => `/api/memos/{{memos.${owner}.${memo}.id}}`;

/** 本文を返さずに断る（存在を伏せる 404 も認める） */
const denied = (owner: Owner): ResponseExpectation => ({
  status: [403, 404],
  body: [{ path: '', is: { notContains: `{{memos.${owner}.private.body}}` } }],
});

const readOther = (reader: ActorKey, owner: Owner): Step => ({
  kind: 'request',
  as: reader,
  request: { method: 'GET', path: memoPath(owner, 'private') },
  expect: denied(owner),
});

/** reader が owner の非公開メモを読み、本文を受け取る */
const readAs = (reader: Owner, owner: Owner): Step => ({
  kind: 'request',
  as: reader,
  request: { method: 'GET', path: memoPath(owner, 'private') },
  expect: { status: 200, body: [{ path: 'memo.body', is: { equals: `{{memos.${owner}.private.body}}` } }] },
});
const readOwn = (owner: Owner) => readAs(owner, owner);

/** 所有者以外の誰もが owner の非公開メモを読めてしまう。detect は、owner 以外の利用者が owner のメモを受け取ったやり取り */
function readOthersMemo(owner: Owner): ProbeDef {
  return {
    id: `read-${owner}-memo`,
    title: `別の利用者が ${owner} の非公開メモを ID 指定で読める`,
    steps: USERS.filter((reader) => reader !== owner).map((reader) => readAs(reader, owner)),
    detect: {
      actor: { not: owner },
      request: { method: 'GET', path: '/api/memos/*' },
      response: { status: 200, body: [{ path: 'memo.ownerId', is: { equals: `{{users.${owner}.id}}` } }] },
    },
  };
}

/** どの利用者のメモが読まれても再現とみなせるよう、所有者ごとに probe を置く */
export const PROBES: ProbeDef[] = USERS.map(readOthersMemo);

/** 攻撃阻止のテスト。アプリ共通の memo.read.other-denied・memo.create.owner-spoof とあわせて、注入した状態で失敗する */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'idor.read.cross-users',
    category: 'security',
    title: 'どの利用者の組み合わせでも、別の利用者の非公開メモは読めない',
    steps: [readOther('alice', 'bob'), readOther('alice', 'carol'), readOther('bob', 'carol'), readOther('carol', 'bob')],
  },
  {
    id: 'idor.read.new-memo',
    category: 'security',
    title: '新しく作られたメモも、作成者以外は読めない',
    steps: [
      {
        kind: 'request',
        as: 'carol',
        request: { method: 'POST', path: '/api/memos', body: { title: '新しい非公開メモ', body: '作成者だけが読める本文' } },
        expect: { status: 201 },
        capture: { id: 'memo.id' },
      },
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'GET', path: '/api/memos/{{capture.id}}' },
        expect: { status: [403, 404], body: [{ path: '', is: { notContains: '作成者だけが読める本文' } }] },
      },
    ],
  },
  {
    id: 'idor.read.owner-spoof',
    category: 'security',
    title: '要求に ownerId・userId を書いて所有者を名乗っても、別の利用者のメモは読めない',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'GET', path: `${memoPath('alice', 'private')}?ownerId={{users.bob.id}}&userId={{users.alice.id}}` },
        expect: denied('alice'),
      },
    ],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'idor.read-own.all-users',
    category: 'normal',
    title: 'どの利用者も自分の非公開メモを読める',
    steps: [readOwn('bob'), readOwn('carol')],
  },
  {
    id: 'idor.write.cross-users',
    category: 'security',
    title: '別の利用者のメモは、どの組み合わせでも更新・削除できない',
    steps: [
      {
        kind: 'request',
        as: 'carol',
        request: { method: 'PUT', path: memoPath('bob', 'private'), body: { title: '書き換え', body: '書き換え' } },
        expect: { status: [403, 404] },
      },
      { kind: 'request', as: 'alice', request: { method: 'DELETE', path: memoPath('carol', 'other') }, expect: { status: [403, 404] } },
      readOwn('bob'),
      { kind: 'request', as: 'carol', request: { method: 'GET', path: memoPath('carol', 'other') }, expect: { status: 200 } },
    ],
  },
];
