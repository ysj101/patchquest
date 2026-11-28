// ミッション「スタンプが勝手に付くのを防ぐ」（送信元を確かめない postMessage、CWE-346）。
// 「スタンプを送る」画面が、届いたメッセージの送り主を確かめずに使い、広告のページが送ったメッセージでスタンプが書き込まれる事故を題材にする
import type { MissionPack, MutationRecipeDef } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const HOOKS = [{ id: 'stamp.message.accept', contract: 1 }];
const TARGET_APP = { appId: 'memo', versions: '^1.4.0' };
/** 注入：届いたメッセージを、送り主を確かめずに受け入れる実装へ切り替える */
const INJECTION: MutationRecipeDef = {
  id: 'accept-any-sender',
  version: '1.0.0',
  appliesTo: { ...TARGET_APP, hooks: HOOKS },
  apply: [{ hook: 'stamp.message.accept', implementation: 'postmessage-origin/accept-any-sender' }],
  verify: { probes: PROBES.map((probe) => probe.id) },
  revert: 'baseline',
};
const DIFF_FILE = 'apps/memo/stamp-view.ts';
/** 受け取る処理の参考コード。check は、中身を読む前に置く行（なければ空） */
const listener = (check: string) => `window.addEventListener('message', (event) => {${check}
  const stamp = readStamp(event.data);
  if (stamp) postStamp(stamp);
});`;
const ACCEPT_ANY = listener('');

export const postmessageOriginPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'postmessage-origin',
    version: '1.0.0',
    kind: 'mission',
    title: 'スタンプが勝手に付くのを防ぐ',
    summary:
      '押していないスタンプが、自分の名前で書き込まれたという問い合わせを調べます。ほかのページから届いたメッセージを、送り主を確かめてから使うように直します。',
    learningObjectives: [
      '広告のページが送ったメッセージで、開いた人の名前のスタンプが書き込まれることを再現できる',
      '届いたメッセージの中身・送り主のオリジン・送り主の窓のうち、どれで送り主を見分けられるかを説明できる',
      '対策のあと、広告のメッセージは捨てられ、スタンプの部品は今までどおり使えると確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: {
      name: '送り主を確かめないメッセージ',
      plain: 'ほかのページから届いたメッセージを、だれが送ったか確かめずに信じてしまう問題',
      fullName: 'オリジンの検証の誤り（postMessage の送信元の未確認）',
      cwe: 'CWE-346',
      category: 'authorization',
    },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: 'carol さん', role: '共有ページの利用者' },
      incident:
        '利用者の carol さんから問い合わせがありました。「共有ページの『スタンプを送る』で、広告の『応募する』を押しました。すると、押していない『いいね！』が、わたしの名前でコメントに付いていました。スタンプの部品には触っていません」',
      goal: 'スタンプは、スタンプの部品で押したときだけ書き込みます。ほかのページから届いたメッセージでは書き込みません。スタンプの部品は、今までどおり使えます。',
      protectedAssets: ['共有ページのコメント（押していないスタンプが、本人の名前で書き込まれないこと）'],
      normalUse: ['スタンプの部品で押したスタンプが、押した人の名前で書き込まれる'],
    },
    hooks: HOOKS,
    conflicts: [],
    prerequisites: { features: ['comments', 'stamps'] },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    appCompatibility: TARGET_APP,
    fixtures: { generator: 'memo.default', variants: [{ id: 'stamp-screen', label: 'スタンプを送る画面', recipe: INJECTION.id }] },
    mutationRecipes: [INJECTION],
    actions: [],
    approach: APPROACH,
    defenses: [
      {
        id: 'check-source',
        label: '送り主の窓が、スタンプの部品かを確かめる',
        description: 'event.source（メッセージを送った窓）を、自分で開いたスタンプの部品の窓と比べます。違う窓から届いたメッセージは捨てます。',
        apply: [{ hook: 'stamp.message.accept', implementation: 'memo/stamp-from-picker' }],
        referenceDiff: { file: DIFF_FILE, language: 'ts', before: ACCEPT_ANY, after: listener('\n  if (event.source !== picker.contentWindow) return;') },
        expected: 'secure',
      },
      {
        id: 'check-null-origin',
        label: '送り主のオリジンが "null" かを確かめる',
        description: 'event.origin（メッセージを送ったページの出どころ）を見ます。スタンプの部品は sandbox の中にあり、オリジンは "null" です。"null" ではないメッセージは捨てます。',
        apply: [{ hook: 'stamp.message.accept', implementation: 'postmessage-origin/null-origin' }],
        referenceDiff: { file: DIFF_FILE, language: 'ts', before: ACCEPT_ANY, after: listener(`\n  if (event.origin !== 'null') return;`) },
        whyItFails: '広告のオリジンも "null" で、広告のメッセージがそのまま通りました。',
        expected: 'insufficient',
      },
      {
        id: 'drop-all',
        label: 'メッセージをすべて捨てる',
        description: 'どこから届いたメッセージも使いません。広告のメッセージは通りませんが、スタンプの部品のメッセージも捨てます。',
        apply: [{ hook: 'stamp.message.accept', implementation: 'postmessage-origin/drop-all' }],
        referenceDiff: {
          file: DIFF_FILE,
          language: 'ts',
          before: ACCEPT_ANY,
          after: `window.addEventListener('message', () => {
  // 何もしない
});`,
        },
        whyItFails: 'メッセージをすべて捨てたので、スタンプの部品で押したスタンプも書き込まれなくなりました。',
        expected: 'breaks-normal',
      },
    ],
    probes: PROBES,
    tests: {
      target: ['stamp.unknown-sender', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
