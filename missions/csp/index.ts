// ミッション「書きこまれたスクリプトを、ブラウザに止めさせる」（Content-Security-Policy の付け忘れ）。
// 掲示板のコメントに書きこまれたスクリプトが、開いた人の画面で動く。ページの応答に Content-Security-Policy を付けて、ブラウザに止めさせる。
// ページは本物の HTTP 応答として開き、スクリプトを動かすか止めるかは Chrome が決める（必要機能 http-pages）。
// 対策を選ぶのではなく、設定のページでヘッダの値を書く操作そのものが修正になる（repair: record）
import { HEADERS_HOOK, RENDER_HOOK } from '../../apps/board/hooks';
import { SETTINGS_ROUTE } from '../../apps/board/server';
import type { MissionPack, MutationRecipeDef } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, REPAIR_GUIDE, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET } from './tests';

const TARGET_APP = { appId: 'board', versions: '^1.0.0' };
const HOOKS = [
  { id: HEADERS_HOOK, contract: 1 },
  { id: RENDER_HOOK, contract: 1 },
];

/** コメントをそのまま HTML に入れる掲示板を、Content-Security-Policy を付けずに配備する */
const RECIPE: MutationRecipeDef = {
  id: 'no-policy',
  version: '1.0.0',
  appliesTo: { ...TARGET_APP, hooks: HOOKS },
  apply: [
    { hook: HEADERS_HOOK, implementation: 'csp/no-policy' },
    { hook: RENDER_HOOK, implementation: 'csp/comment-raw' },
  ],
  verify: { probes: PROBES.map((probe) => probe.id) },
  revert: 'baseline',
};

export const cspPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'csp',
    version: '1.0.0',
    kind: 'mission',
    title: '書きこまれたスクリプトを、ブラウザに止めさせる',
    summary:
      '掲示板のコメントに書きこまれたスクリプトが、開いた人の画面で動いています。ページの応答に Content-Security-Policy というヘッダを付けて、ブラウザに止めさせます。ページは本物の HTTP 応答として開きます。',
    learningObjectives: [
      'ページの応答ヘッダを見て、Content-Security-Policy が付いているかを確かめられる',
      "script-src 'self' を付けると、ページの中に書きこまれたスクリプトをブラウザが止めることを確かめられる",
      "'unsafe-inline' を足すと守りにならず、'none' にするとページ自身のスクリプトも止まると説明できる",
    ],
    estimatedMinutes: 15,
    vulnerability: {
      name: 'CSP の付け忘れ',
      plain: 'ページに紛れこんだスクリプトをブラウザに止めさせる設定が、付いていない問題',
      fullName: '保護の仕組みの不備（Content-Security-Policy がない）',
      cwe: 'CWE-693',
      category: 'misconfiguration',
    },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: '森さん', role: '掲示板の管理者' },
      incident:
        '管理者の森さんから依頼がありました。「掲示板を開くと、何もしていないのに勝手な動きが起きる、と連絡がありました。コメントにスクリプトが書きこまれているようです。表示の直しは開発チームが進めていますが、時間がかかります。直し漏れがあっても被害が出ないよう、サーバの側で守りを足してください」',
      goal: '掲示板に書きこまれたスクリプトを、ブラウザが動かさないようにします。掲示板自身のスクリプト（コメントの件数の表示）は、今までどおり動くようにします。',
      protectedAssets: ['掲示板を開いた人の画面（書きこまれたスクリプトが勝手に動くこと）'],
      normalUse: ['掲示板に、コメントの件数が出る'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'http-pages'] },
    prerequisites: { features: ['pages', 'comments', 'response-headers'] },
    hooks: HOOKS,
    conflicts: [],
    fixtures: { generator: 'board.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE.id }] },
    mutationRecipes: [RECIPE],
    actions: [],
    approach: APPROACH,
    repairGuide: REPAIR_GUIDE,
    defenses: [],
    // 直すのは、設定のページでヘッダの値を保存する操作。保存できた送信（設定のページへ戻す応答）だけを記録する
    repair: { kind: 'record', record: { kind: 'request', request: { method: 'POST', path: SETTINGS_ROUTE }, response: { status: 303 } }, noun: '加えた変更' },
    probes: PROBES,
    tests: { target: TARGET, cases: CASES },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
