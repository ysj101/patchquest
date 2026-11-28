// メモアプリ共通のテストのうち、「スタンプを送る」画面のもの。画面を本物の iframe ごと描画し、届いたメッセージの扱いを、観測イベントと保存されたコメントで確かめる
import type { TestCase } from '../../platform/contract';
import { STAMPS } from './hooks';

const PAGE = '/api/pages/{{pages.shared.id}}';
/** 「スタンプを送る」画面を開き、開いた直後に picker（スタンプの部品）か ad（広告）のボタンを 1 回押す */
const STAMP_VIEW = (press: 'picker' | 'ad') => ({ route: `/pages/{{pages.shared.id}}/stamps?press=${press}` });

export const STAMP_TESTS: TestCase[] = [
  {
    id: 'stamp.from-picker',
    category: 'normal',
    title: 'スタンプの部品で押したスタンプが、押した人の名前でコメントに書き込まれる',
    steps: [
      {
        kind: 'render',
        as: 'carol',
        view: STAMP_VIEW('picker'),
        events: [{ type: 'message.received', where: [{ path: 'sender', is: { equals: 'picker' } }, { path: 'accepted', is: { equals: true } }] }],
      },
      {
        kind: 'request',
        as: 'alice',
        request: { method: 'GET', path: PAGE },
        expect: { status: 200, body: [{ path: 'comments', is: { contains: `"authorName":"carol","body":"${STAMPS[0]}"` } }] },
      },
    ],
  },
  {
    id: 'stamp.unknown-sender',
    category: 'security',
    title: 'スタンプの部品ではないページ（広告）が同じ形のメッセージを送っても、スタンプは書き込まれない',
    steps: [
      {
        kind: 'render',
        as: 'carol',
        view: STAMP_VIEW('ad'),
        events: [
          { type: 'message.received', where: [{ path: 'sender', is: { equals: 'ad' } }, { path: 'accepted', is: { equals: false } }] },
          { type: 'message.received', where: [{ path: 'accepted', is: { equals: true } }], presence: 'absent' },
        ],
      },
      { kind: 'request', as: 'carol', request: { method: 'GET', path: PAGE }, expect: { status: 200, body: [{ path: 'comments', is: { notContains: STAMPS[0] } }] } },
    ],
  },
];
