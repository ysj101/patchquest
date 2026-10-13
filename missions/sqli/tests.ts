// SQL インジェクションパックの攻撃の成立条件とテスト。
// 合否はクエリ形・バインド値・返却行の所有者で決め、選んだ対策の ID では決めない。
// 正常系はバインドの有無を求めない（注入した状態でも、自分のメモの検索は通る必要がある）
import type { ActorKey, ProbeDef, TestCase } from '../../platform/contract';
import { USERS } from '../../apps/memo/fixtures';

/** 所有者の条件を、タイトルが何でも合う形で広げる。UNION という語は含まない */
export const OR_TITLE = "') OR title LIKE '%' --";
/** 所有者の条件を、常に真の比較で広げる */
export const OR_TRUE = "') OR 2=2 --";
/** 別の SELECT を足して、全員のメモを返す */
export const UNION_TITLES = "') UNION SELECT id, owner_id, title FROM memos --";

const searchPath = (term: string) => `/api/search?q=${encodeURIComponent(term)}`;

/** 他人のメモが結果に含まれず、クエリはプレースホルダと、その利用者の ID のバインドを持つ */
function guarded(actor: ActorKey, term: string): TestCase['steps'][number] {
  const userId = `{{users.${actor}.id}}`;
  return {
    kind: 'request',
    as: actor,
    request: { method: 'GET', path: searchPath(term) },
    expect: { status: 200, body: [{ path: 'results.*.ownerId', is: { equals: userId } }] },
    events: [
      {
        type: 'sql.query',
        where: [
          { path: 'owners.*', is: { equals: userId } },
          { path: 'sql', is: { contains: '?' } },
          { path: 'bind', is: { contains: userId } },
        ],
      },
    ],
  };
}

/** searcher の検索結果に、other の所有者 ID が含まれる */
function leaked(searcher: ActorKey, other: ActorKey): ProbeDef {
  const marker = `"ownerId":{{users.${other}.id}}`;
  return {
    id: `search-as-${searcher}`,
    title: `${searcher} の検索が、${other} のメモを結果に含める`,
    steps: [
      {
        kind: 'request',
        as: searcher,
        request: { method: 'GET', path: searchPath(OR_TITLE) },
        expect: { status: 200, body: [{ path: 'results', is: { contains: marker } }] },
      },
    ],
    detect: {
      kind: 'request',
      actor: { is: searcher },
      request: { method: 'GET', path: '/api/search' },
      response: { status: 200, body: [{ path: 'results', is: { contains: marker } }] },
    },
  };
}

function otherThan(searcher: (typeof USERS)[number]): (typeof USERS)[number] {
  const next = USERS[(USERS.indexOf(searcher) + 1) % USERS.length];
  if (!next) throw new Error(`次の利用者を決められません: ${searcher}`);
  return next;
}

export const PROBES: ProbeDef[] = USERS.map((searcher) => leaked(searcher, otherThan(searcher)));

/** 攻撃阻止。登録済みの検索語で、他人の行が返らない */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'sqli.or-title',
    category: 'security',
    title: 'タイトルの条件を広げる検索語でも、他人のメモは返らない',
    steps: [guarded('alice', OR_TITLE)],
  },
  {
    id: 'sqli.or-true',
    category: 'security',
    title: '常に真になる比較を足す検索語でも、他人のメモは返らない',
    steps: [guarded('bob', OR_TRUE)],
  },
  {
    id: 'sqli.union',
    category: 'security',
    title: 'UNION で一覧を足す検索語でも、他人のメモは返らない',
    steps: [guarded('carol', UNION_TITLES)],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'sqli.own-report',
    category: 'normal',
    title: '日本語の検索語で、自分のメモを探せる',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'GET', path: '/api/search?q={{search.term}}' },
        expect: {
          status: 200,
          body: [
            { path: 'results', is: { minLength: 1 } },
            { path: 'results.*.ownerId', is: { equals: '{{users.bob.id}}' } },
          ],
        },
      },
    ],
  },
  {
    id: 'sqli.quoted-no-leak',
    category: 'normal',
    title: '引用符を含む語で検索してもエラーにならず、他人のメモは出ない',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'GET', path: '/api/search?q={{search.quoted}}' },
        expect: {
          status: 200,
          body: [
            { path: 'results.*.ownerId', is: { equals: '{{users.bob.id}}' } },
            { path: 'results', is: { notContains: '"ownerId":{{users.alice.id}}' } },
          ],
        },
      },
    ],
  },
];
