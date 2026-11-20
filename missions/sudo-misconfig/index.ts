// ミッション「広すぎる sudo の許可を絞る」（設定ミスによる過剰な権限）。運用担当に、管理者だけが行う保守の操作まで sudo で
// 許可されているサーバを点検し、ターミナルの操作で設定を絞る。対策を選ぶのではなく、操作そのものが修正になる（repair: record）
import { STATE_CHANGING_COMMAND } from '../../apps/shell/scenario';
import type { ActionDef, MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { DEBRIEF, HINTS, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

const HOOKS = [{ id: 'shell.sudoers.provision', contract: 1 }];
const TARGET_APP = { appId: 'shell', versions: '^1.0.0' };
const RECIPE = 'excess-sudo-grant';
/** 運用担当向けの sudo の設定ファイル。場所は seed によらず同じ（説明文は {{キー}} を展開しないので、そのまま書く） */
const OPERATORS_SUDOERS = '/etc/sudoers.d/operators';

/** コマンド行を 1 つ送る定型の操作。端末に打たなくても、調査タブから同じ操作ができる（結果は観測ログに出る） */
const command = (action: Pick<ActionDef, 'id' | 'label' | 'description'> & { line: string; fields?: ActionDef['fields'] }): ActionDef => ({
  id: action.id,
  label: action.label,
  description: action.description,
  request: { method: 'POST', path: '/sh', body: { line: action.line } },
  fields: action.fields ?? [],
  editable: false,
});

export const sudoMisconfigPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'sudo-misconfig',
    version: '1.0.0',
    kind: 'mission',
    title: '広すぎる sudo の許可を絞る',
    summary:
      '運用担当が、管理者だけのはずの保守の操作まで実行できたという報告を調べます。ターミナルで sudo の設定を点検し、不要な許可だけを外して、普段の運用操作は残します。',
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
    actions: [
      command({ id: 'sudo-list', label: '自分が sudo で実行できる操作を一覧する', description: 'いまの利用者に許可された操作を表示します（sudo -l）。結果は観測ログの応答に出ます。', line: 'sudo -l' }),
      command({
        id: 'sudo-run',
        label: 'プログラムを sudo で実行する',
        description: '指定したプログラムを、root の権限で実行しようとします（sudo パス）。許可されていなければ断られます。',
        line: 'sudo {{field.program}}',
        fields: [{ name: 'program', label: 'プログラムのパス', input: 'text', help: '/ から始まるパスを入力します。許可の一覧や運用メモで確かめられます。' }],
      }),
      command({
        id: 'show-sudoers',
        label: '運用担当向けの sudo の設定を表示する',
        description: `設定ファイルを行番号つきで表示します（sudo edit ${OPERATORS_SUDOERS}）。管理者だけが表示できます。`,
        line: `sudo edit ${OPERATORS_SUDOERS}`,
      }),
      command({
        id: 'disable-line',
        label: '設定の 1 行を無効にする',
        description: '設定ファイルの指定した行を、コメント（# で始まる行）に書き換えます。管理者だけが書き換えられます。',
        line: `sudo edit ${OPERATORS_SUDOERS} {{field.line}} '# 許可を外した'`,
        fields: [{ name: 'line', label: '行番号', input: 'number', help: '設定を表示したときの行番号を入力します。' }],
      }),
    ],
    defenses: [],
    // 状態を変えた操作（ファイルを書き換えた edit）だけを記録する。調べるだけの操作や、断られた操作は記録しない
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
