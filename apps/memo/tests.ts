// メモアプリ共通のテスト。安全な基準状態 S ではすべて通る（spec A01）。
// ID や名前はハードコードせず fixture の値（{{キー}}）で参照し、複数の seed で同じテストが通るようにする
import type { TestCase } from '../../platform/contract';

const ALICE_PRIVATE = '/api/memos/{{memos.alice.private.id}}';
const PAGE = '/api/pages/{{pages.shared.id}}';
const PAGE_VIEW = { route: '/pages/{{pages.shared.id}}' };
const OWN_RESULTS_ONLY = [{ path: 'results.*.ownerId', is: { equals: '{{users.alice.id}}' } }];
const DENIED = { status: [403, 404], body: [{ path: '', is: { notContains: '{{memos.alice.private.body}}' } }] };
/** 所有者 alice が自分の非公開メモを本文まで読める。正常系と、他者の操作後に本文が残っている確認で使う */
const ALICE_READS_OWN_PRIVATE: TestCase['steps'][number] = {
  kind: 'request',
  as: 'alice',
  request: { method: 'GET', path: ALICE_PRIVATE },
  expect: { status: 200, body: [{ path: 'memo.body', is: { equals: '{{memos.alice.private.body}}' } }] },
};

export const MEMO_TESTS: TestCase[] = [
  // 正常系
  {
    id: 'memo.list-own',
    category: 'normal',
    title: '自分のメモだけが一覧に出る',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/memos' },
        expect: { status: 200, body: [{ path: 'memos', is: { minLength: 2 } }, { path: 'memos.*.ownerId', is: { equals: '{{users.alice.id}}' } }] },
      },
    ],
  },
  {
    id: 'memo.read-own',
    category: 'normal',
    title: '所有者は自分のメモを読める',
    steps: [
      ALICE_READS_OWN_PRIVATE,
    ],
  },
  {
    id: 'memo.create',
    category: 'normal',
    title: 'メモを作成して読める（日本語・記号を含む）',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'POST', path: '/api/memos', body: { title: '会議 <議事録> & "要点"', body: '次回：資料を共有する' } },
        expect: { status: 201 },
        capture: { id: 'memo.id' },
      },
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'GET', path: '/api/memos/{{capture.id}}' },
        expect: {
          status: 200,
          body: [
            { path: 'memo.title', is: { equals: '会議 <議事録> & "要点"' } },
            { path: 'memo.ownerId', is: { equals: '{{users.bob.id}}' } },
          ],
        },
      },
    ],
  },
  {
    id: 'memo.update-own',
    category: 'normal',
    title: '所有者は自分のメモを更新できる',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'PUT', path: ALICE_PRIVATE, body: { title: '更新したメモ', body: '更新後の本文' } },
        expect: { status: 200 },
      },
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: ALICE_PRIVATE },
        expect: { status: 200, body: [{ path: 'memo.body', is: { equals: '更新後の本文' } }] },
      },
    ],
  },
  {
    id: 'memo.delete-own',
    category: 'normal',
    title: '所有者は自分のメモを削除できる',
    steps: [
      { kind: 'request', as: 'alice', request: { method: 'DELETE', path: ALICE_PRIVATE }, expect: { status: 204 } },
      { kind: 'request', as: 'alice', request: { method: 'GET', path: ALICE_PRIVATE }, expect: { status: 404 } },
    ],
  },

  {
    id: 'comment.post-and-read',
    category: 'normal',
    title: 'コメントを投稿すると、ほかの利用者も文字どおりに読める（日本語・記号・角括弧）',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'POST', path: `${PAGE}/comments`, body: { body: "感想：<b>図</b> & '例' がわかりやすい" } },
        expect: { status: 201 },
      },
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: PAGE },
        expect: { status: 200, body: [{ path: '', is: { contains: "感想：<b>図</b> & '例' がわかりやすい" } }, { path: '', is: { contains: '{{comments.carol.body}}' } }] },
      },
    ],
  },
  {
    id: 'comment.render-as-text',
    category: 'normal',
    title: '角括弧を含むコメントを表示しても実行マーカーが発生しない',
    steps: [
      { kind: 'request', as: 'bob', request: { method: 'POST', path: `${PAGE}/comments`, body: { body: '<b>強調</b> と <i>斜体</i>' } }, expect: { status: 201 } },
      { kind: 'render', as: 'alice', view: PAGE_VIEW, events: [{ type: 'dom.marker', presence: 'absent' }] },
    ],
  },
  {
    id: 'search.own',
    category: 'normal',
    title: '自分のメモを検索できる（日本語）',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/search?q={{search.term}}' },
        expect: { status: 200, body: [{ path: 'results', is: { minLength: 1 } }, ...OWN_RESULTS_ONLY] },
        events: [{ type: 'sql.query' }],
      },
    ],
  },
  {
    id: 'search.quoted',
    category: 'normal',
    title: '引用符を含む語で検索できる',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/search?q={{search.quoted}}' },
        expect: { status: 200, body: [{ path: 'results.0.id', is: { equals: '{{memos.alice.quoted.id}}' } }, ...OWN_RESULTS_ONLY] },
      },
    ],
  },
  {
    id: 'search.no-hit',
    category: 'normal',
    title: '該当がなければ空の結果になる',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: '/api/search?q={{search.none}}' },
        expect: { status: 200, body: [{ path: 'results', is: { equals: [] } }] },
      },
    ],
  },

  // セキュリティ
  {
    id: 'comment.no-script',
    category: 'security',
    title: 'コメントに書かれたスクリプトは、ほかの利用者の画面で実行されない',
    steps: [
      { kind: 'request', as: 'bob', request: { method: 'POST', path: `${PAGE}/comments`, body: { body: '<img src="x" onerror="pqMarker()">' } }, expect: { status: 201 } },
      { kind: 'render', as: 'alice', view: PAGE_VIEW, events: [{ type: 'dom.marker', presence: 'absent' }] },
    ],
  },
  {
    id: 'comment.author-spoof',
    category: 'security',
    title: 'リクエストの authorId を偽っても投稿者は変わらない',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'POST', path: `${PAGE}/comments`, body: { body: '偽装', authorId: '{{users.alice.id}}' } },
        expect: { status: 201, body: [{ path: 'comment.authorId', is: { equals: '{{users.bob.id}}' } }] },
      },
    ],
  },
  {
    id: 'comment.anonymous-denied',
    category: 'security',
    title: '未ログインでは共有ページを読めず、コメントもできない',
    steps: [
      { kind: 'request', as: 'anonymous', request: { method: 'GET', path: PAGE }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'POST', path: `${PAGE}/comments`, body: { body: 'x' } }, expect: { status: 401 } },
    ],
  },
  {
    id: 'search.injection',
    category: 'security',
    title: '検索語に SQL の構文を混ぜても、他人のメモは返らない',
    steps: [
      { kind: 'request', as: 'alice', request: { method: 'GET', path: "/api/search?q=x' OR '1'='1" }, expect: { status: [200, 400], body: [...OWN_RESULTS_ONLY] } },
      { kind: 'request', as: 'alice', request: { method: 'GET', path: "/api/search?q=%' OR 1=1 --" }, expect: { status: [200, 400], body: [...OWN_RESULTS_ONLY] } },
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: "/api/search?q=') UNION SELECT id, owner_id, body FROM memos --" },
        expect: { status: [200, 400], body: [...OWN_RESULTS_ONLY] },
      },
    ],
  },
  {
    id: 'search.anonymous-denied',
    category: 'security',
    title: '未ログインでは検索できない',
    steps: [{ kind: 'request', as: 'anonymous', request: { method: 'GET', path: '/api/search?q={{search.term}}' }, expect: { status: 401 } }],
  },
  {
    id: 'memo.read.other-denied',
    category: 'security',
    title: '別の利用者のメモは読めない',
    steps: [
      { kind: 'request', as: 'bob', request: { method: 'GET', path: ALICE_PRIVATE }, expect: DENIED },
      { kind: 'request', as: 'carol', request: { method: 'GET', path: ALICE_PRIVATE }, expect: DENIED },
    ],
  },
  {
    id: 'memo.read.anonymous-denied',
    category: 'security',
    title: '未ログインではメモを読めない',
    steps: [
      { kind: 'request', as: 'anonymous', request: { method: 'GET', path: ALICE_PRIVATE }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'GET', path: '/api/memos' }, expect: { status: 401 } },
    ],
  },
  {
    id: 'memo.read.missing',
    category: 'security',
    title: '存在しない ID は 404 になる',
    steps: [{ kind: 'request', as: 'alice', request: { method: 'GET', path: '/api/memos/{{memos.missing.id}}' }, expect: { status: 404 } }],
  },
  {
    id: 'memo.create.owner-spoof',
    category: 'security',
    title: 'リクエストの ownerId を偽っても所有者は変わらない',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'POST', path: '/api/memos', body: { title: '偽装', body: 'x', ownerId: '{{users.alice.id}}', userId: '{{users.alice.id}}' } },
        expect: { status: 201, body: [{ path: 'memo.ownerId', is: { equals: '{{users.bob.id}}' } }] },
        capture: { id: 'memo.id' },
      },
      { kind: 'request', as: 'alice', request: { method: 'GET', path: '/api/memos/{{capture.id}}' }, expect: { status: [403, 404] } },
    ],
  },
  {
    id: 'memo.update.other-denied',
    category: 'security',
    title: '別の利用者のメモは更新できない',
    steps: [
      {
        kind: 'request',
        as: 'bob',
        request: { method: 'PUT', path: ALICE_PRIVATE, body: { title: '書き換え', body: '書き換え' } },
        expect: { status: [403, 404] },
      },
      ALICE_READS_OWN_PRIVATE,
    ],
  },
  {
    id: 'memo.delete.other-denied',
    category: 'security',
    title: '別の利用者のメモは削除できない',
    steps: [
      { kind: 'request', as: 'bob', request: { method: 'DELETE', path: ALICE_PRIVATE }, expect: { status: [403, 404] } },
      { kind: 'request', as: 'alice', request: { method: 'GET', path: ALICE_PRIVATE }, expect: { status: 200 } },
    ],
  },
  {
    id: 'memo.write.anonymous-denied',
    category: 'security',
    title: '未ログインではメモを作成・更新・削除できない',
    steps: [
      { kind: 'request', as: 'anonymous', request: { method: 'POST', path: '/api/memos', body: { title: 'x', body: 'x' } }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'PUT', path: ALICE_PRIVATE, body: { title: 'x', body: 'x' } }, expect: { status: 401 } },
      { kind: 'request', as: 'anonymous', request: { method: 'DELETE', path: ALICE_PRIVATE }, expect: { status: 401 } },
    ],
  },
  {
    id: 'memo.write.title-length',
    category: 'security',
    title: '上限を超えるタイトルは保存されない',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'POST', path: '/api/memos', body: { title: 'あ'.repeat(41), body: 'x' } },
        expect: { status: 400, body: [{ path: 'field', is: { equals: 'title' } }] },
      },
    ],
  },
];
