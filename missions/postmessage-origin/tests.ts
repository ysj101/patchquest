// 「送信元を確かめない postMessage」パックの攻撃の成立条件とテスト。
// 「スタンプを送る」画面を本物の iframe ごと描画し、広告のページが送ったメッセージの扱いを、観測イベントと保存されたコメントで判定する
import type { ActorKey, EventExpectation, ProbeDef, Step, TestCase } from '../../platform/contract';
import { USERS } from '../../apps/memo/fixtures';
import { STAMPS } from '../../apps/memo/hooks';

/** 広告と、開いた直後に押されるスタンプの部品が送るスタンプ */
const STAMP = STAMPS[0];
const PAGE = '/api/pages/{{pages.shared.id}}';

/** sender（picker：スタンプの部品、ad：広告）から届いたメッセージを、受け入れた・捨てた */
const received = (sender: 'picker' | 'ad', accepted: boolean): EventExpectation => ({
  type: 'message.received',
  where: [
    { path: 'sender', is: { equals: sender } },
    { path: 'accepted', is: { equals: accepted } },
  ],
});

/** viewer が「スタンプを送る」画面を開き、開いた直後に press の枠のボタンが 1 回押される */
const open = (viewer: ActorKey, press: 'picker' | 'ad', events: EventExpectation[]): Step => ({
  kind: 'render',
  as: viewer,
  view: { route: `/pages/{{pages.shared.id}}/stamps?press=${press}` },
  events,
});

/** 共有ページのコメントに、author の名前のスタンプがある・ない */
const stampBy = (author: ActorKey, present: boolean): Step => {
  const stamp = `"authorName":"${author}","body":"${STAMP}"`;
  return {
    kind: 'request',
    as: author,
    request: { method: 'GET', path: PAGE },
    expect: { status: 200, body: [{ path: 'comments', is: present ? { contains: stamp } : { notContains: stamp } }] },
  };
};

/** viewer が広告の「応募する」を押すと、viewer の名前でスタンプが書き込まれる */
function adStamps(viewer: ActorKey): ProbeDef {
  return {
    id: `ad-stamps-as-${viewer}`,
    title: `広告のページが送ったメッセージで、${viewer} の名前のスタンプが書き込まれる`,
    steps: [open(viewer, 'ad', [received('ad', true)]), stampBy(viewer, true)],
    detect: { kind: 'render', actor: { is: viewer }, events: [received('ad', true)] },
  };
}

export const PROBES: ProbeDef[] = USERS.map(adStamps);

/** 攻撃阻止。問い合わせに出てくる利用者だけでなく、ほかの利用者が開いたときも、広告のメッセージでは書き込まれない */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'postmessage-origin.ad-denied',
    category: 'security',
    title: 'だれが開いた画面でも、広告のページが送ったメッセージは捨てられ、スタンプは書き込まれない',
    steps: (['alice', 'bob'] as const).flatMap((viewer) => [
      open(viewer, 'ad', [received('ad', false), { type: 'message.received', where: [{ path: 'accepted', is: { equals: true } }], presence: 'absent' }]),
      stampBy(viewer, false),
    ]),
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'postmessage-origin.picker-works',
    category: 'normal',
    title: 'スタンプの部品で押したスタンプは、押した人の名前で書き込まれる',
    steps: (['alice', 'bob'] as const).flatMap((viewer) => [open(viewer, 'picker', [received('picker', true)]), stampBy(viewer, true)]),
  },
];
