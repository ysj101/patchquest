// 確かめない更新のパックの、攻撃の成立条件と固有のテスト。書き換えた更新が root の権限で動いたかどうかは、
// 更新に足した保守の操作の実行の記録で確かめる。利用者名・プログラム名は fixture の値で参照する
import { FAILED, SUCCEEDED, operatorRanAsRoot, ranAsRoot, sh } from '../../apps/shell/scenario';
import type { ProbeDef, TestCase } from '../../platform/contract';

const MAINTENANCE = '{{programs.maintenance.path}}';
const APPLY = '{{programs.update.path}}';
const UPDATE_FILE = '{{updates.file.path}}';
const CONFIG = '{{updates.config.path}}';
const SUMS = '{{updates.sums.path}}';

/** 保守の操作が root の権限で実行された、という観測イベント */
const MAINTENANCE_RAN_AS_ROOT = ranAsRoot(MAINTENANCE);

/** 受け取った更新の末尾に、保守の操作を 1 行足すコマンド行 */
const APPEND_MAINTENANCE = `echo ${MAINTENANCE} >> ${UPDATE_FILE}`;

export const PROBES: ProbeDef[] = [
  {
    id: 'tampered-update-runs-as-root',
    title: '書き換えた更新を取り込むと、足した行が root の権限で動く',
    steps: [sh('operator', APPEND_MAINTENANCE, SUCCEEDED), sh('operator', `sudo ${APPLY}`, SUCCEEDED, [MAINTENANCE_RAN_AS_ROOT])],
    // 管理者が保守の操作を実行しても再現にはならない。運用担当の操作だけを数える
    detect: operatorRanAsRoot(MAINTENANCE),
  },
];

/** 攻撃阻止（脆弱な状態では失敗する） */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'unverified-update.tampered-rejected',
    category: 'security',
    title: '中身を書き換えられた更新は、取り込まない',
    // だれが書き換えたかによらず止める。配布元で書き換えられた更新は、置き場を守っても届くので、ここでは管理者が書き換える
    steps: [
      sh('admin', `sudo sh -c '${APPEND_MAINTENANCE}'`, SUCCEEDED),
      sh('operator', `sudo ${APPLY}`, FAILED, [ranAsRoot(MAINTENANCE, 'absent')]),
    ],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'unverified-update.genuine-applied',
    category: 'normal',
    title: '運用担当は、配布元が出したままの更新を取り込める',
    steps: [sh('operator', `sudo ${APPLY}`, { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'stdout', is: { contains: '取り込みました' } }] }, [ranAsRoot(APPLY)])],
  },
  {
    id: 'unverified-update.settings-protected',
    category: 'security',
    title: '運用担当は、中身を確かめる設定と一覧を書き換えられない',
    steps: [
      sh('operator', `sudoedit ${CONFIG}`, FAILED),
      sh('operator', `echo verify=off >> ${CONFIG}`, FAILED),
      sh('operator', `echo x >> ${SUMS}`, FAILED),
    ],
  },
];
