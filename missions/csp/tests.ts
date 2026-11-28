// CSP のパックの攻撃の成立条件とテスト。攻撃コメントは、初期データにある検証済みの固定の文字列だけ。
// 掲示板を本物のページとして開き、ブラウザがスクリプトを動かしたか・止めたかで判定する
import { USERS } from '../../apps/board/fixtures';
import { BOARD_ROUTE } from '../../apps/board/server';
import { NO_INLINE_SCRIPT } from '../../apps/board/tests';
import type { ActorKey, ProbeDef, TestCase } from '../../platform/contract';

const BOARD_VIEW = { route: BOARD_ROUTE };

/** viewer が掲示板を開くと、コメントに書きこまれたスクリプトが動く */
const viewAttack = (viewer: ActorKey): ProbeDef => ({
  id: `view-as-${viewer}`,
  title: `${viewer} が掲示板を開くと、コメントに書きこまれたスクリプトが動く`,
  steps: [{ kind: 'render', as: viewer, view: BOARD_VIEW, events: [{ type: 'dom.marker' }] }],
  detect: { kind: 'render', actor: { is: viewer }, events: [{ type: 'dom.marker' }] },
});

export const PROBES: ProbeDef[] = USERS.map(viewAttack);

/** 攻撃阻止。掲示板の共通テスト（だれが開いても、書きこまれたスクリプトが動かない） */
export const TARGET = [NO_INLINE_SCRIPT];

export const CASES: TestCase[] = [
  {
    id: 'csp.count-for-everyone',
    category: 'normal',
    title: 'だれが掲示板を開いても、ページ自身のスクリプトが動き、コメントの件数が出る',
    steps: USERS.map((viewer) => ({
      kind: 'render',
      as: viewer,
      view: BOARD_VIEW,
      events: [{ type: 'board.counted', where: [{ path: 'count', is: { equals: '{{comments.count}}' } }] }],
    })),
  },
];
