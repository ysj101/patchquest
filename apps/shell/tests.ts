// 擬似シェル共通のテスト。安全な基準状態 S ではすべて通る（spec A01）。
// 利用者名・プログラム名はハードコードせず fixture の値（{{キー}}）で参照し、複数の seed で同じテストが通るようにする
import type { TestCase } from '../../platform/contract';
import { FAILED, SAVED, SUCCEEDED, ranAsRoot, saveWithVisudo, sh } from './scenario';

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
    title: '管理者は visudo で sudo の設定を開き、書き換えて保存できる',
    steps: [
      sh('admin', `sudo visudo -f ${OPERATORS_SUDOERS}`, { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'changed', is: { equals: false } }, { path: 'editor.path', is: { equals: OPERATORS_SUDOERS } }] }),
      saveWithVisudo('admin', OPERATORS_SUDOERS, [{ line: 1, text: '# 点検済み' }], SAVED, [{ type: 'file.changed', where: [{ path: 'path', is: { equals: OPERATORS_SUDOERS } }] }]),
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
    title: '運用担当は sudo の設定を開くことも、書き換えることもできない',
    steps: [
      sh('operator', `visudo -f ${OPERATORS_SUDOERS}`, FAILED),
      sh('operator', `sudo visudo -f ${OPERATORS_SUDOERS}`, FAILED),
      saveWithVisudo('operator', OPERATORS_SUDOERS, [{ line: 1, text: '# 書き換え' }], FAILED, [{ type: 'file.changed', presence: 'absent' }]),
    ],
  },
  {
    id: 'shell.sudoers-syntax-checked',
    category: 'security',
    title: '読めない内容の sudo の設定は保存されない',
    steps: [
      saveWithVisudo('admin', OPERATORS_SUDOERS, [{ line: 2, text: 'これは設定ではない' }], FAILED),
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
