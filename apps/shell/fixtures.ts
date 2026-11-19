// 架空の機械の初期データ。seed からホスト名・利用者名・プログラム名を決める（spec §5.4）。時刻は固定で、同じ seed なら同じ機械になる
import type { JsonPrimitive } from '../../platform/contract';
import type { FixtureGenerator } from '../../runtimes/browser/app-module';
import type { Database } from '../../runtimes/browser/sqlite';
import { random } from '../shared/random';
import { COMMANDS } from './exec';
import type { ProvisionSudoers } from './hooks';
import { ROOT, SUDOERS_DIR, SUDOERS_FILE, type FileNode } from './model';
import { parseSudoers } from './sudoers';

/** 演習ハーネスの利用者キー。operator は運用担当、admin は管理者 */
export const ACTORS = ['operator', 'admin'] as const;
/** 運用担当向けの sudo の設定ファイル。本文は交換点 shell.sudoers.provision が決める */
export const OPERATORS_SUDOERS = `${SUDOERS_DIR}/operators`;

const HOSTS = ['web-01', 'app-02', 'batch-03', 'gate-04'];
const OPERATOR_NAMES = ['sato', 'suzuki', 'takahashi', 'tanaka'];
const ADMIN_NAMES = ['ito', 'watanabe', 'yamamoto', 'nakamura'];
const OPERATIONS = [
  ['svc-status', 'サービスの状態：稼働中'],
  ['svc-restart', 'サービスを再起動しました'],
  ['log-rotate', 'ログを切り替えました'],
  ['queue-flush', '待ち行列を送り出しました'],
] as const;
const MAINTENANCE = ['account-admin', 'backup-restore', 'storage-init', 'network-policy'];
const PUBLIC_PROGRAM = '/usr/local/bin/sys-info';
const DIRECTORIES = ['/', '/etc', SUDOERS_DIR, '/home', '/usr', '/usr/bin', '/usr/local', '/usr/local/bin', '/usr/local/sbin', '/var', '/var/log'];

interface NewAccount {
  name: string;
  actor: string | null;
  uid: number;
  home: string;
  groups: string[];
}

/** seed から決めた、機械の顔ぶれ */
interface Cast {
  host: string;
  operator: NewAccount;
  admin: NewAccount;
  /** 運用担当の日常の操作（2 つ） */
  operations: { path: string; output: string }[];
  /** 管理者だけが行う保守の操作 */
  maintenance: string;
  /** 権限の要らないプログラムの出力 */
  publicOutput: string;
}

/** ファイル・ディレクトリを置く。親ディレクトリを先に置いておく */
function put(db: Database, node: Omit<FileNode, 'content'> & { content?: string }): void {
  const parent = node.path === '/' ? null : node.path.slice(0, node.path.lastIndexOf('/')) || '/';
  db.exec({ sql: 'INSERT INTO files (path, parent, kind, owner, readable, content) VALUES (?, ?, ?, ?, ?, ?)', bind: [node.path, parent, node.kind, node.owner, node.readable, node.content ?? ''] });
}

function putProgram(db: Database, path: string, needsRoot: boolean, output: string): void {
  put(db, { path, kind: 'program', owner: ROOT, readable: 'all' });
  db.exec({ sql: 'INSERT INTO programs (path, needs_root, output) VALUES (?, ?, ?)', bind: [path, needsRoot ? 1 : 0, output] });
}

function addAccount(db: Database, account: NewAccount): void {
  db.exec({ sql: 'INSERT INTO accounts (name, actor, uid, home) VALUES (?, ?, ?, ?)', bind: [account.name, account.actor, account.uid, account.home] });
  for (const group of account.groups) db.exec({ sql: 'INSERT INTO memberships (account, grp) VALUES (?, ?)', bind: [account.name, group] });
}

/** seed から、ホスト名・利用者名・プログラム名を重ならないように選ぶ */
function cast(seed: number): Cast {
  const next = random(seed);
  /** 重ならないように count 件を選ぶ */
  const pick = <T>(items: readonly T[], count = 1): T[] => {
    const rest = [...items];
    return Array.from({ length: count }, () => rest.splice(Math.floor(next() * rest.length), 1)).flat();
  };
  const person = (names: readonly string[], actor: string, uidFrom: number, group: string): NewAccount => {
    const name = pick(names).join('');
    return { name, actor, uid: uidFrom + Math.floor(next() * 400), home: `/home/${name}`, groups: [name, group] };
  };
  const host = pick(HOSTS).join('');
  return {
    host,
    operator: person(OPERATOR_NAMES, 'operator', 1000, 'operators'),
    admin: person(ADMIN_NAMES, 'admin', 1500, 'admin'),
    operations: pick(OPERATIONS, 2).map(([name, output]) => ({ path: `/usr/local/bin/${name}`, output })),
    maintenance: `/usr/local/sbin/${pick(MAINTENANCE).join('')}`,
    publicOutput: `${host}: 稼働 12 日・負荷 0.${10 + Math.floor(next() * 80)}`,
  };
}

/** 利用者・ディレクトリ・プログラムを置く */
function build(db: Database, { host, operator, admin, operations, maintenance, publicOutput }: Cast): void {
  db.exec({ sql: "INSERT INTO machine (key, value) VALUES ('hostname', ?)", bind: [host] });
  for (const account of [{ name: ROOT, actor: null, uid: 0, home: '/root', groups: [ROOT] }, operator, admin]) addAccount(db, account);
  for (const path of DIRECTORIES) put(db, { path, kind: 'dir', owner: ROOT, readable: 'all' });
  put(db, { path: '/root', kind: 'dir', owner: ROOT, readable: 'owner' });
  for (const account of [operator, admin]) put(db, { path: account.home, kind: 'dir', owner: account.name, readable: 'all' });
  // 登録簿のコマンドのうち実行ファイルがあるもの。中身は持たず、実行は登録簿が受け持つ
  for (const command of Object.values(COMMANDS)) if (command.path !== null) put(db, { path: command.path, kind: 'program', owner: ROOT, readable: 'all' });
  for (const operation of operations) putProgram(db, operation.path, true, operation.output);
  putProgram(db, maintenance, true, '保守操作を実行しました（root の権限）');
  putProgram(db, PUBLIC_PROGRAM, false, publicOutput);
}

/** 設定ファイルと、調べる手がかりになるファイルを置く。granted は運用担当への sudo の許可（交換点が決めた行） */
function writeFiles(db: Database, { host, operator, operations, maintenance }: Cast, granted: string[]): string {
  const operatorsSudoers = ['# 運用担当に sudo で許可する操作', ...granted].join('\n');
  const broken = parseSudoers(operatorsSudoers).errors[0];
  if (broken) throw new Error(`shell.sudoers.provision が返した設定を読めません（${broken.line} 行目：${broken.message}）`);

  put(db, { path: '/etc/hostname', kind: 'file', owner: ROOT, readable: 'all', content: host });
  put(db, { path: SUDOERS_FILE, kind: 'file', owner: ROOT, readable: 'owner', content: ['# 管理者グループはすべてのコマンドを実行できる', '%admin ALL=(ALL) NOPASSWD: ALL'].join('\n') });
  put(db, { path: OPERATORS_SUDOERS, kind: 'file', owner: ROOT, readable: 'owner', content: operatorsSudoers });
  const runbook = `${operator.home}/runbook.txt`;
  put(db, {
    path: runbook, kind: 'file', owner: operator.name, readable: 'all',
    content: [`運用メモ（${host}）`, ...operations.map((operation) => `- 日常の運用操作：sudo ${operation.path}`), `- 保守の操作（${maintenance}）は管理者だけが行う。必要なときは管理者に依頼する`].join('\n'),
  });
  put(db, {
    path: '/var/log/ops.log', kind: 'file', owner: ROOT, readable: 'all',
    content: operations.map((operation, index) => `2026-10-12T09:0${index}:00+09:00 ${operator.name} sudo ${operation.path}`).join('\n'),
  });
  return runbook;
}

export const shellFixture: FixtureGenerator = (db, seed, hook) => {
  const machine = cast(seed);
  const { operator, admin, maintenance } = machine;
  const operations = machine.operations.map((operation) => operation.path);
  build(db, machine);
  // 運用担当への許可は交換点が決める。レシピが注入した実装なら、ここで過剰な許可が初期データに入る
  const granted = hook<ProvisionSudoers>('shell.sudoers.provision')({ operator: operator.name, operations, maintenance: [maintenance] });
  const runbook = writeFiles(db, machine, granted);
  const refs: Record<string, JsonPrimitive> = {
    'host.name': machine.host,
    'accounts.operator.name': operator.name,
    'accounts.operator.home': operator.home,
    'accounts.admin.name': admin.name,
    'programs.maintenance.path': maintenance,
    'programs.public.path': PUBLIC_PROGRAM,
    'sudoers.operators.path': OPERATORS_SUDOERS,
    'files.runbook.path': runbook,
  };
  // 1 つめを programs.operation.path、2 つめ以降を programs.operation2.path … として参照する
  operations.forEach((path, index) => (refs[`programs.operation${index === 0 ? '' : index + 1}.path`] = path));
  return refs;
};
