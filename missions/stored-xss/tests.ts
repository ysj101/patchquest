// 保存型 XSS パックの攻撃の成立条件とテスト。攻撃コメントは隔離 PoC（#3）で確定した固定ペイロードだけ。
// 保存したあとに別の利用者がページを開き直し、実行マーカーと、画面に出た文字列で判定する
import type { ActorKey, ProbeDef, Step, TestCase } from '../../platform/contract';
import { USERS } from '../../apps/memo/fixtures';

/** 隔離 iframe の CSP が実行を許す、検証済みの固定ペイロード。任意の JavaScript は使わない */
export const ATTACK_COMMENT = '<img src="x" onerror="pqMarker()">';
/** 日本語・記号・角括弧。HTML のタグにはならない並び */
export const PLAIN_COMMENT = '価格は <100> 円 & "税込"';

const PAGE = '/api/pages/{{pages.shared.id}}';
const PAGE_VIEW = { route: '/pages/{{pages.shared.id}}' };

const post = (actor: ActorKey, body: string): Step => ({
  kind: 'request',
  as: actor,
  request: { method: 'POST', path: `${PAGE}/comments`, body: { body } },
  expect: { status: 201, body: [{ path: 'comment.body', is: { equals: body } }] },
});

/** viewer が共有ページを開いたとき、実行マーカーが出る */
function viewAttack(viewer: ActorKey): ProbeDef {
  const poster = USERS.find((user) => user !== viewer);
  if (!poster) throw new Error(`投稿する利用者を決められません: ${viewer}`);
  return {
    id: `view-as-${viewer}`,
    title: `${poster} の攻撃コメントを ${viewer} が開くと、画面でスクリプトが実行される`,
    steps: [post(poster, ATTACK_COMMENT), { kind: 'render', as: viewer, view: PAGE_VIEW, events: [{ type: 'dom.marker' }] }],
    detect: { kind: 'render', actor: { is: viewer }, events: [{ type: 'dom.marker' }] },
  };
}

export const PROBES: ProbeDef[] = USERS.map(viewAttack);

/** 攻撃阻止。保存済みの攻撃コメントを、投稿者以外が開き直しても実行されず、文字列のまま残る */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'stored-xss.saved-attack',
    category: 'security',
    title: '保存済みの攻撃コメントを別の利用者が開き直しても実行されず、入力した文字列のまま表示される',
    steps: [
      post('bob', ATTACK_COMMENT),
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: PAGE },
        expect: { status: 200, body: [{ path: '', is: { contains: 'pqMarker()' } }] },
      },
      {
        kind: 'render',
        as: 'alice',
        view: PAGE_VIEW,
        events: [
          { type: 'dom.marker', presence: 'absent' },
          { type: 'comment.rendered', where: [{ path: 'text', is: { equals: ATTACK_COMMENT } }] },
        ],
      },
      {
        kind: 'render',
        as: 'carol',
        view: PAGE_VIEW,
        events: [
          { type: 'dom.marker', presence: 'absent' },
          { type: 'comment.rendered', where: [{ path: 'text', is: { equals: ATTACK_COMMENT } }] },
        ],
      },
    ],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'stored-xss.show-text',
    category: 'normal',
    title: '日本語・記号・角括弧のコメントが文字として表示され、実行マーカーは出ない',
    steps: [
      post('bob', PLAIN_COMMENT),
      {
        kind: 'render',
        as: 'alice',
        view: PAGE_VIEW,
        events: [
          { type: 'dom.marker', presence: 'absent' },
          { type: 'comment.rendered', where: [{ path: 'text', is: { equals: PLAIN_COMMENT } }] },
          { type: 'comment.rendered', where: [{ path: 'text', is: { equals: '{{comments.carol.body}}' } }] },
        ],
      },
    ],
  },
];
