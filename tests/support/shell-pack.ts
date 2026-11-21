// 擬似シェルの土台（操作で直す課題）の検証専用の課題パック。運用担当への過剰な sudo の許可を初期データへ注入する。配布物には含めない
import type { ProvisionSudoers } from '../../apps/shell/hooks';
import { STATE_CHANGING_COMMAND, SUCCEEDED, ranAsRoot, sh, visudoSave } from '../../apps/shell/scenario';
import type { MissionPack, ReplayEntry } from '../../platform/contract';
import type { PackVerificationData } from './verification-data';

const MAINTENANCE = '{{programs.maintenance.path}}';

/** 設定ファイルの 1 行目は見出し、2 行目は日常の運用操作、3 行目は保守の操作（過剰な許可） */
const withMaintenance: ProvisionSudoers = ({ operator, operations, maintenance }) => [
  `${operator} ALL=(root) NOPASSWD: ${operations.join(', ')}`,
  `${operator} ALL=(root) NOPASSWD: ${maintenance.join(', ')}`,
];

export const shellTestPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'shell-test-pack',
    version: '1.0.0',
    kind: 'mission',
    title: '擬似シェルの検証用パック',
    summary: '操作で直す課題の土台の検証に使う',
    learningObjectives: ['検証用'],
    estimatedMinutes: 5,
    vulnerability: { name: '過剰な sudo の許可', plain: '運用担当が、管理者だけの操作まで実行できてしまう問題', fullName: '不適切な権限管理', cwe: 'CWE-269', category: 'misconfiguration' },
    difficulty: 'beginner',
    story: { incident: '運用担当が保守の操作まで実行できる', goal: '保守の操作を管理者だけに絞る', protectedAssets: ['保守の操作'], normalUse: ['運用担当が日常の運用操作を実行できる'] },
    appCompatibility: { appId: 'shell', versions: '^2.0.0' },
    runtime: { adapter: 'browser', capabilities: ['sqlite', 'dom-preview'] },
    prerequisites: { features: ['terminal', 'sudo'] },
    hooks: [{ id: 'shell.sudoers.provision', contract: 1 }],
    conflicts: [],
    fixtures: { generator: 'shell.default', variants: [{ id: 'default', label: '標準', recipe: 'excess-sudo' }] },
    mutationRecipes: [
      {
        id: 'excess-sudo',
        version: '1.0.0',
        appliesTo: { appId: 'shell', versions: '^2.0.0', hooks: [{ id: 'shell.sudoers.provision', contract: 1 }] },
        apply: [{ hook: 'shell.sudoers.provision', implementation: 'shell-test-pack/sudoers-with-maintenance' }],
        verify: { probes: ['operator-runs-maintenance'] },
        revert: 'baseline',
      },
    ],
    actions: [],
    defenses: [],
    repair: { kind: 'record', record: STATE_CHANGING_COMMAND, noun: '加えた変更' },
    probes: [
      {
        id: 'operator-runs-maintenance',
        title: '運用担当が保守の操作を root として実行できる',
        steps: [sh('operator', `sudo ${MAINTENANCE}`, SUCCEEDED, [ranAsRoot(MAINTENANCE)])],
        detect: { actor: { is: 'operator' }, request: { method: 'POST', path: '/sh' }, events: [ranAsRoot(MAINTENANCE)] },
      },
    ],
    tests: { target: ['shell.maintenance-denied'], cases: [] },
    hints: [
      { level: 1, text: '運用担当が sudo で何を実行できるか' },
      { level: 2, text: 'sudo -l で許可された操作を一覧する' },
      { level: 3, text: '管理者として、保守の操作の許可を外す' },
    ],
    solution: '管理者で sudo visudo -f を使い、保守の操作を許可している行をコメントにする',
    transferCheck: [
      {
        id: 'q1',
        situation: '別の運用担当にも、保守の操作が許可されていた',
        prompt: '有効な対策はどれか',
        choices: [
          { id: 'narrow', label: '必要な操作だけを許可する', correct: true, explanation: '許可を仕事に必要な分だけに絞る' },
          { id: 'hide', label: '運用メモから保守の操作を消す', correct: false, explanation: '設定が残っていれば実行できる' },
        ],
      },
    ],
    debrief: { cause: '運用担当に保守の操作まで許可していた', defenseRationale: '許可を必要な分だけに絞る', takeaways: ['最小権限にする'] },
  },
  implementations: {
    'shell-test-pack/sudoers-with-maintenance': { hook: 'shell.sudoers.provision', run: withMaintenance },
    // 読めない設定を返す実装。初期データの生成が、黙って続けずに止まることを確かめる
    'shell-test-pack/sudoers-unreadable': { hook: 'shell.sudoers.provision', run: (() => ['これは設定ではない']) satisfies ProvisionSudoers },
  },
};

/** 管理者として、運用担当向けの設定ファイルの 1 行をコメントに書き換えて保存する操作 */
export const commentOut = (line: number): ReplayEntry => ({ as: 'admin', request: visudoSave('/etc/sudoers.d/operators', [{ line, text: '# 許可を外した' }]) });

/** 操作で直す課題は学習画面に対策候補を持たないので、解ける操作と誤った操作を出荷前検証の候補として確かめる */
export const shellTestVerification: PackVerificationData = {
  packId: 'shell-test-pack',
  implementations: {},
  candidates: [
    { id: 'remove-maintenance', apply: [], replay: [commentOut(3)], expected: 'secure' },
    { id: 'remove-everything', apply: [], replay: [commentOut(2), commentOut(3)], expected: 'breaks-normal' },
    { id: 'edit-heading-only', apply: [], replay: [commentOut(1)], expected: 'insufficient' },
  ],
};
