// ミッション「広すぎる sudo の許可を絞る」（設定ミスによる過剰な権限）。運用担当に、管理者だけが行う保守の操作まで sudo で
// 許可されているサーバを点検し、ターミナルの操作で設定を絞る。対策を選ぶのではなく、操作そのものが修正になる（repair: record）。
// 端末の中身は本物の Linux（教材アプリ「Linux 端末」。WASM のエミュレータで動く）で、sudo の判断も本物の sudo が行う
import { PROVISION_HOOK } from '../../apps/shell/linux/hooks';
import { STATE_CHANGING_COMMAND } from '../../apps/shell/scenario';
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const HOOKS = [{ id: PROVISION_HOOK, contract: 1 }];
const TARGET_APP = { appId: 'linux', versions: '^1.0.0' };
const RECIPE = 'excess-sudo-grant';
export const sudoMisconfigPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'sudo-misconfig',
    version: '2.0.0',
    kind: 'mission',
    title: '広すぎる sudo の許可を絞る',
    summary:
      '運用担当が、管理者だけのはずの保守の操作まで実行できたという報告を調べます。ターミナルで sudo の設定を点検し、不要な許可だけを外して、普段の運用操作は残します。端末の中では、本物の Linux と本物の sudo が動きます。',
    learningObjectives: [
      'ターミナルで、利用者が sudo で実行できる操作を調べ、仕事に必要な範囲を超えた許可を見つけられる',
      '手順書を直すことと、設定そのものを絞ることの違いを説明できる',
      '設定を絞ったあと、止めたい操作が拒否され、普段の運用操作は通ることを確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: '過剰な sudo 権限', plain: '運用担当が、管理者だけのはずの操作まで root の権限で実行できてしまう問題', fullName: '不適切な権限管理', cwe: 'CWE-269', category: 'misconfiguration' },
    difficulty: 'beginner',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: '森さん', role: 'サーバの管理者',
        reactions: {
          reproduced: '運用担当の権限で、保守の操作まで動いてしまうんですね。',
          secured: '保守の操作は管理者だけになりました。運用の作業もこれまでどおりですね。',
          closing: '許可は、仕事に必要な分だけにするんですね。',
        },
      },
      incident:
        '管理者の森さんから依頼がありました。「運用担当から『運用メモでは管理者だけが行うことになっている保守の操作を、自分の権限で実行できてしまった』と報告がありました。このサーバの sudo の設定を点検してください」',
      goal: '保守の操作は、管理者だけが sudo で実行できるようにします。運用担当は、日常の運用操作をこれまでどおり sudo で実行できるようにします。',
      protectedAssets: ['管理者だけが行う保守の操作（root の権限での実行）'],
      normalUse: ['運用担当は、日常の運用操作を sudo で実行できる', '管理者は、保守の操作と sudo の設定の変更ができる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview', 'linux-vm'] },
    prerequisites: { features: ['terminal', 'sudo'] },
    hooks: HOOKS,
    conflicts: [],
    fixtures: { generator: 'linux.default', variants: [{ id: 'default', label: '標準', recipe: RECIPE }] },
    mutationRecipes: [
      {
        id: RECIPE,
        version: '1.0.0',
        appliesTo: { ...TARGET_APP, hooks: HOOKS },
        apply: [{ hook: PROVISION_HOOK, implementation: 'sudo-misconfig/grant-maintenance-too' }],
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
