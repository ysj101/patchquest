// 掲示板の共通テスト。安全な基準状態 S ではすべて通る。課題パックは tests.target から ID で参照できる
import type { Step, TestCase } from '../../platform/contract';
import { USERS } from './fixtures';
import { BOARD_ROUTE, SETTINGS_ROUTE } from './server';

const BOARD_VIEW = { route: BOARD_ROUTE };

/** actor が掲示板を開いても、ページに書きこまれたスクリプトは動かない */
const noInlineScript = (actor: string): Step => ({ kind: 'render', as: actor, view: BOARD_VIEW, events: [{ type: 'dom.marker', presence: 'absent' }] });

export const NO_INLINE_SCRIPT = 'board.no-inline-script';

export const BOARD_TESTS: TestCase[] = [
  {
    id: NO_INLINE_SCRIPT,
    category: 'security',
    title: 'だれが掲示板を開いても、コメントに書きこまれたスクリプトは動かない',
    steps: USERS.map(noInlineScript),
  },
  {
    id: 'board.page-script-works',
    category: 'normal',
    title: '掲示板のページ自身のスクリプトが動き、コメントの件数が出る',
    steps: [
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: BOARD_ROUTE },
        expect: { status: 200, body: [{ path: '', is: { contains: '{{comments.plain.body}}' } }] },
      },
      { kind: 'render', as: 'alice', view: BOARD_VIEW, events: [{ type: 'board.counted', where: [{ path: 'count', is: { equals: '{{comments.count}}' } }] }] },
    ],
  },
  {
    id: 'board.settings-admin-only',
    category: 'security',
    title: '応答ヘッダの設定は、管理者だけが開ける・変えられる',
    steps: [
      { kind: 'request', as: 'alice', request: { method: 'GET', path: SETTINGS_ROUTE }, expect: { status: 403 } },
      { kind: 'request', as: 'bob', request: { method: 'POST', path: SETTINGS_ROUTE, body: { value: '' } }, expect: { status: 403 } },
      { kind: 'request', as: 'anonymous', request: { method: 'GET', path: SETTINGS_ROUTE }, expect: { status: 403 } },
    ],
  },
  {
    id: 'board.settings-open',
    category: 'normal',
    title: '管理者は、応答ヘッダの設定のページを開ける',
    steps: [
      {
        kind: 'request',
        as: 'admin',
        request: { method: 'GET', path: SETTINGS_ROUTE },
        expect: { status: 200, body: [{ path: '', is: { contains: 'Content-Security-Policy' } }] },
      },
    ],
  },
];
