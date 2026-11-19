// 擬似シェル共通のテスト。安全な基準状態 S ではすべて通る（spec A01）。
// 利用者名・プログラム名はハードコードせず fixture の値（{{キー}}）で参照し、複数の seed で同じテストが通るようにする
import type { TestCase } from '../../platform/contract';
import { FAILED, SUCCEEDED, ranAsRoot, sh } from './scenario';

const OPERATION = '{{programs.operation.path}}';
const OPERATION2 = '{{programs.operation2.path}}';
const MAINTENANCE = '{{programs.maintenance.path}}';
const OPERATORS_SUDOERS = '{{sudoers.operators.path}}';

export const SHELL_TESTS: TestCase[] = [
  // 正常系
  {
    id: 'shell.whoami',
    category: 'normal',
    title: 'ログインした利用者として端末を使える',
    steps: [sh('operator', 'whoami', { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'stdout', is: { equals: '{{accounts.operator.name}}' } }] })],
  },
  {
    id: 'shell.operation-allowed',
    category: 'normal',
    title: '運用担当は、日常の運用操作を sudo で実行できる',
    steps: [sh('operator', `sudo ${OPERATION}`, SUCCEEDED, [ranAsRoot(OPERATION)]), sh('operator', `sudo ${OPERATION2}`, SUCCEEDED, [ranAsRoot(OPERATION2)])],
  },
  {
    id: 'shell.public-program',
    category: 'normal',
    title: '権限の要らないプログラムは、sudo なしで実行できる',
    steps: [sh('operator', '{{programs.public.path}}', SUCCEEDED)],
  },
  {
    id: 'shell.read-runbook',
    category: 'normal',
    title: '運用担当は自分の運用メモを読める',
    steps: [sh('operator', 'cat {{files.runbook.path}}', { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'stdout', is: { contains: '{{host.name}}' } }] })],
  },
  {
    id: 'shell.admin-maintenance',
    category: 'normal',
    title: '管理者は保守の操作を sudo で実行できる',
    steps: [sh('admin', `sudo ${MAINTENANCE}`, SUCCEEDED, [ranAsRoot(MAINTENANCE)])],
  },
  {
    id: 'shell.admin-edits-sudoers',
    category: 'normal',
    title: '管理者は sudo の設定を書き換えられる',
    steps: [
      sh('admin', `sudo edit ${OPERATORS_SUDOERS} 1 '# 点検済み'`, { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'changed', is: { equals: true } }] }),
      sh('admin', `sudo cat ${OPERATORS_SUDOERS}`, { status: 200, body: [{ path: 'stdout', is: { contains: '# 点検済み' } }] }),
    ],
  },
  // セキュリティ
  {
    id: 'shell.maintenance-denied',
    category: 'security',
    title: '運用担当は、保守の操作を sudo で実行できない',
    steps: [
      sh('operator', `sudo ${MAINTENANCE}`, FAILED, [ranAsRoot(MAINTENANCE, 'absent'), { type: 'sudo.decision', where: [{ path: 'decision', is: { equals: 'deny' } }] }]),
    ],
  },
  {
    id: 'shell.maintenance-needs-root',
    category: 'security',
    title: '保守の操作は、sudo を通さずには実行できない',
    steps: [sh('operator', MAINTENANCE, FAILED, [{ type: 'shell.exec', presence: 'absent' }])],
  },
  {
    id: 'shell.sudoers-unreadable',
    category: 'security',
    title: '運用担当は sudo の設定ファイルを直接は読めない',
    steps: [sh('operator', 'cat /etc/sudoers', FAILED), sh('operator', `cat ${OPERATORS_SUDOERS}`, FAILED)],
  },
  {
    id: 'shell.sudoers-edit-denied',
    category: 'security',
    title: '運用担当は sudo の設定を書き換えられない',
    steps: [
      sh('operator', `edit ${OPERATORS_SUDOERS} 1 '# 書き換え'`, FAILED),
      sh('operator', `sudo edit ${OPERATORS_SUDOERS} 1 '# 書き換え'`, FAILED, [{ type: 'file.changed', presence: 'absent' }]),
    ],
  },
  {
    id: 'shell.sudoers-syntax-checked',
    category: 'security',
    title: '読めない内容の sudo の設定は保存されない',
    steps: [
      sh('admin', `sudo edit ${OPERATORS_SUDOERS} 2 'これは設定ではない'`, FAILED),
      sh('admin', `sudo cat ${OPERATORS_SUDOERS}`, { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'stdout', is: { notContains: 'これは設定ではない' } }] }),
    ],
  },
  {
    id: 'shell.anonymous-denied',
    category: 'security',
    title: '未ログインでは端末を使えない',
    steps: [{ kind: 'request', as: 'anonymous', request: { method: 'POST', path: '/sh', body: { line: 'whoami' } }, expect: { status: 401 } }],
  },
];
