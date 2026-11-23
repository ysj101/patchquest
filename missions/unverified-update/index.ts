// ミッション「更新を、確かめてから取り込む」（中身を確かめない更新の取り込み）。配布元から受け取った更新を root の権限で取り込む
// サーバで、中身の確認が設定で切られたままになっている。ターミナルで取り込みの仕組みを調べ、確認を有効にする。
// 対策を選ぶのではなく、操作そのものが修正になる（repair: record）。端末の中身は本物の Linux（教材アプリ「Linux 端末」）
import { UPDATE_HOOK } from '../../apps/shell/linux/update';
import { TERMINAL_REPAIR } from '../../apps/shell/scenario';
import type { MissionPack, MutationRecipeDef } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, REPAIR_GUIDE, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const TARGET_APP = { appId: 'linux', versions: '^1.4.0' };
const HOOKS = [{ id: UPDATE_HOOK, contract: 1 }];

/** 中身の確認を切った設定を、初期データに入れる */
const RECIPE: MutationRecipeDef = {
  id: 'verification-left-off',
  version: '1.0.0',
  appliesTo: { ...TARGET_APP, hooks: HOOKS },
  apply: [{ hook: UPDATE_HOOK, implementation: 'unverified-update/verification-left-off' }],
  verify: { probes: PROBES.map((probe) => probe.id) },
  revert: 'baseline',
};

export const unverifiedUpdatePack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'unverified-update',
    version: '1.0.0',
    kind: 'mission',
    title: '更新を、確かめてから取り込む',
    summary:
      '配布元が乗っ取られ、書き換えられた更新が配られる事故が起きています。このサーバが、書き換えられた更新を受け取っても止められるかを調べます。端末の中では、本物の Linux が動きます。',
    learningObjectives: [
      'ターミナルで、更新を取り込むプログラムが、動かす前に何を確かめているかを調べられる',
      '「置き場を守る」と「受け取った中身を確かめる」の違いを説明できる',
      '設定を直したあと、書き換えた更新は止まり、正しい更新は取り込めると確かめられる',
    ],
    estimatedMinutes: 15,
    vulnerability: { name: '確かめない更新', plain: '受け取った更新の中身を確かめずに、root の権限で動かしてしまう問題', fullName: '完全性を確かめないコードの取り込み', cwe: 'CWE-494', category: 'misconfiguration' },
    difficulty: 'beginner',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: {
        name: '関さん', role: 'サーバの管理者',
        reactions: {
          reproduced: '足した行まで、root の権限で動いてしまうんですね。',
          secured: '書き換えた更新は止まるようになりました。正しい更新は今までどおりですね。',
          closing: '受け取ったものは、確かめてから動かすんですね。',
        },
      },
      incident:
        '管理者の関さんから依頼がありました。「よその会社で、更新の配布元が乗っ取られ、書き換えられた更新を取り込んだサーバが被害にあいました。このサーバは、書き換えられた更新を受け取ったら止められるでしょうか。更新の取り込みを調べてください」',
      goal: '中身を書き換えられた更新は、取り込まないようにします。配布元が出したままの更新は、運用担当が今までどおり取り込めるようにします。',
      protectedAssets: ['更新の取り込み（root の権限での実行）'],
      normalUse: ['運用担当は、配布元が出したままの更新を sudo で取り込める', '管理者は、取り込みの設定を変えられる'],
    },
    appCompatibility: TARGET_APP,
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview', 'linux-vm'] },
    prerequisites: { features: ['terminal', 'sudo', 'update'] },
    hooks: HOOKS,
    conflicts: [],
    fixtures: { generator: 'linux.update', variants: [{ id: 'default', label: '標準', recipe: RECIPE.id }] },
    mutationRecipes: [RECIPE],
    approach: APPROACH,
    repairGuide: REPAIR_GUIDE,
    // 調べるのも直すのも、ターミナルにコマンドを打って行う。機械の設定を変えた操作だけを記録する。
    // 置き場（/var/cache）の更新を書き換える操作は、機械の状態の変化に数えないので記録しない
    ...TERMINAL_REPAIR,
    probes: PROBES,
    tests: {
      target: TARGET_CASES.map((test) => test.id),
      cases: CASES,
    },
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
