// sudo の設定ミスのパックの、攻撃の成立条件と固有のテスト。保守の操作を実行できないことは擬似シェルと Linux 端末が共用するテストが確かめるので、
// ここでは許可の一覧（sudo -l）に残っていないかを確かめる。利用者名・プログラム名は fixture の値で参照する
import { SUCCEEDED, operatorRanAsRoot, ranAsRoot, sh } from '../../apps/shell/scenario';
import type { ProbeDef, TestCase } from '../../platform/contract';

const MAINTENANCE = '{{programs.maintenance.path}}';

/** 保守の操作が root の権限で実行された、という観測イベント */
const MAINTENANCE_RAN_AS_ROOT = ranAsRoot(MAINTENANCE);

export const PROBES: ProbeDef[] = [
  {
    id: 'operator-runs-maintenance',
    title: '運用担当が、保守の操作を root の権限で実行できる',
    steps: [sh('operator', `sudo ${MAINTENANCE}`, SUCCEEDED, [MAINTENANCE_RAN_AS_ROOT])],
    // 管理者が実行しても再現にはならない。運用担当の操作だけを数える
    detect: operatorRanAsRoot(MAINTENANCE),
  },
];

/** 攻撃阻止（脆弱な状態では失敗する） */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'sudo-misconfig.maintenance-not-listed',
    category: 'security',
    title: '運用担当の許可の一覧に、保守の操作が残っていない',
    // パスワードを求める形に変えただけでは一覧に残る。本人がパスワードを入れれば実行できるので、許可が残っているとみなす
    steps: [sh('operator', 'sudo -l', { status: 200, body: [{ path: 'stdout', is: { notContains: MAINTENANCE } }] })],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'sudo-misconfig.operations-listed',
    category: 'normal',
    title: '運用担当の許可の一覧に、日常の運用操作が残っている',
    steps: [
      sh('operator', 'sudo -l', {
        status: 200,
        body: [
          { path: 'exit', is: { equals: 0 } },
          { path: 'stdout', is: { contains: '{{programs.operation.path}}' } },
          { path: 'stdout', is: { contains: '{{programs.operation2.path}}' } },
        ],
      }),
    ],
  },
];
