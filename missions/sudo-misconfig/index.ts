// ミッション「広すぎる sudo の許可を絞る」（設定ミスによる過剰な権限）。運用担当に、管理者だけが行う保守の操作まで sudo で
// 許可されているサーバを点検し、ターミナルの操作で設定を絞る。対策を選ぶのではなく、操作そのものが修正になる（repair: record）
import { STATE_CHANGING_COMMAND } from '../../apps/shell/scenario';
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const HOOKS = [{ id: 'shell.sudoers.provision', contract: 1 }];
const TARGET_APP = { appId: 'shell', versions: '^2.0.0' };
const RECIPE = 'excess-sudo-grant';
export const sudoMisconfigPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'sudo-misconfig',
    version: '1.3.0',
    kind: 'mission',
    title: '広すぎる sudo の許可を絞る',
    summary:
      '運用担当が、管理者だけのはずの保守の操作までできてしまった、という報告を調べます。ターミナルで sudo の設定を調べ、いらない許可だけを外します。',
    learningObjectives: [
      'ターミナルで、利用者が sudo でできる操作を調べ、仕事に必要な分より多い許可を見つけられる',
      '「手順書を直す」と「設定そのものを直す」の違いを説明できる',
      '設定を直したあと、止めたい操作は断られ、ふだんの運用の操作はできると確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: '過剰な sudo 権限', plain: '運用担当が、管理者だけのはずの操作まで、root の権限でできてしまう問題', fullName: '不適切な権限管理', cwe: 'CWE-269', category: 'misconfiguration' },
    difficulty: 'beginner',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: '森さん', role: 'サーバの管理者',
        reactions: {
          reproduced: '運用担当なのに、保守の操作までできてしまうんですね。',
          secured: '保守の操作は管理者だけになりました。運用の作業は今までどおりですね。',
          closing: '許可は、仕事に必要な分だけにするんですね。',
        },
      },
      incident:
        '管理者の森さんから依頼がありました。「運用担当から『管理者だけがやるはずの保守の操作が、自分でもできてしまった』と報告がありました。このサーバの sudo の設定を調べてください」',
      goal: '保守の操作は、管理者だけが sudo でできるようにします。運用担当は今までどおり、日常の運用の操作を sudo でできるようにします。',
      protectedAssets: ['管理者だけが行う保守の操作（root の権限での実行）'],
      normalUse: ['運用担当は、日常の運用の操作を sudo でできる', '管理者は、保守の操作と sudo の設定の変更ができる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    prerequisites: { features: ['terminal', 'sudo'] },
    hooks: HOOKS,
    conflicts: [],
    fixtures: { generator: 'shell.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: HOOKS },
        apply: [{ hook: 'shell.sudoers.provision', implementation: 'sudo-misconfig/grant-maintenance-too' }],
        verify: { probes: PROBES.map((probe) => probe.id) },
        revert: 'baseline',
      },
    ],
    // 調べるのも直すのも、ターミナルにコマンドを打って行う。同じ操作を送る定型の操作は置かない
    actions: [],
    approach: APPROACH,
    defenses: [],
    // 状態を変えた操作（visudo で書き換えて保存した）だけを記録する。調べるだけの操作や、断られた操作は記録しない
    repair: { kind: 'record', record: STATE_CHANGING_COMMAND, noun: '加えた変更' },
    probes: PROBES,
    tests: {
      target: ['shell.maintenance-denied', ...TARGET_CASES.map((test) => test.id)],
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
