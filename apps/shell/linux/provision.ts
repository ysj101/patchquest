// 初期データ（擬似シェルと同じ形の SQLite の表）を、演習用の機械（本物の Linux）へ反映する。
// 利用者・ディレクトリ・ファイル・プログラムを作るシェルスクリプトを組み立て、機械の中で root として 1 回実行する
import type { Machine } from '../../../runtimes/browser/machine';
import type { Database } from '../../../runtimes/browser/sqlite';
import { ROOT, SUDOERS_FILE, hostname } from '../model';

/** 機械の中で、利用者のコマンドと係（guest/agent）がファイルを受け渡す場所 */
const WORK_DIR = '/run/pq';
/** 起動直後の機械は動きが遅く、遅い端末では反映に 10 秒近くかかる。実行環境の準備の上限（30 秒）より短くする */
const PROVISION_TIMEOUT_MS = 20_000;
const RESET_TIMEOUT_MS = 4000;
/** 機械の時計。seed が同じなら、ファイルの日付も同じになるようにする */
const CLOCK = '2026-10-12 09:00:00';

/**
 * /etc/sudoers の末尾に足す、この機械のための設定。
 * 端末ではパスワードを入力できないので尋ねない。sudo の判断は記録から読む。編集は用意したエディタ（guest/editor）で行う
 */
const MACHINE_SUDOERS = [
  '# ここから下は、この演習用の機械のための設定（パスワードを尋ねない・sudo の記録を取る・設定のディレクトリを読む）',
  `Defaults !authenticate, !syslog, logfile=${WORK_DIR}/sudo.log, loglinelen=0`,
  'Defaults!/usr/sbin/visudo env_keep += "SUDO_EDITOR EDITOR VISUAL"',
  '@includedir /etc/sudoers.d',
];

interface AccountRow {
  name: string;
  uid: number;
  home: string;
}

interface FileRow {
  path: string;
  kind: 'dir' | 'file' | 'program';
  owner: string;
  readable: 'all' | 'owner';
  content: string;
  needsRoot: number | null;
  output: string | null;
}

/** シェルの 1 語として、そのままの文字列を渡す */
const ESCAPED_QUOTE = String.raw`'\''`;
const quote = (value: string): string => `'${value.replaceAll("'", ESCAPED_QUOTE)}'`;

/** 機械に置くもの。content がなければディレクトリ */
interface Placement {
  path: string;
  owner: string;
  mode: string;
  content?: string;
}

/** 内容をヒアドキュメントで書く（終わりの印は、内容に現れない行にする） */
function writeFile(path: string, content: string): string[] {
  let marker = 'PQ_END';
  while (content.split('\n').includes(marker)) marker += '_';
  return [`cat > ${quote(path)} <<'${marker}'`, content, marker];
}

/** 同じ値（所有者・許可）のものを、1 つのコマンドにまとめる。機械の中ではプロセスを起こすのが遅いので、コマンドの数を減らす */
function grouped(command: string, placements: Placement[], key: (placement: Placement) => string): string[] {
  const values = [...new Set(placements.map(key))];
  return values.map((value) => `${command} ${quote(value)} ${placements.filter((placement) => key(placement) === value).map((placement) => quote(placement.path)).join(' ')}`);
}

function accountCommands(db: Database): string[] {
  const accounts = db.selectObjects('SELECT name, uid, home FROM accounts WHERE name <> ? ORDER BY uid', [ROOT]) as unknown as AccountRow[];
  const memberships = db.selectObjects('SELECT account, grp FROM memberships WHERE account <> ? ORDER BY account, grp', [ROOT]) as unknown as { account: string; grp: string }[];
  const names = new Set(accounts.map((account) => account.name));
  // 利用者と同じ名前のグループは、利用者を作るときにできる
  const groups = [...new Set(memberships.map((membership) => membership.grp))].filter((group) => !names.has(group));
  return [
    ...groups.map((group) => `addgroup ${quote(group)}`),
    ...accounts.map((account) => `adduser -D -u ${account.uid} -h ${quote(account.home)} ${quote(account.name)}`),
    ...memberships.filter((membership) => membership.grp !== membership.account).map((membership) => `addgroup ${quote(membership.account)} ${quote(membership.grp)}`),
  ];
}

/**
 * seed から作る架空のプログラム。決まった出力を返すだけで、機械の状態は変えない。
 * root の権限で動いたことは、root だけが書ける記録に残す（利用者には書き換えられない）
 */
function programScript(row: FileRow): string {
  const lines = ['#!/bin/sh'];
  if (row.needsRoot === 1) {
    lines.push(`[ "$(id -u)" = 0 ] || { echo "$0: この操作には root の権限が必要です" >&2; exit 1; }`, `echo "$0 \${SUDO_USER:-root} root" >> ${WORK_DIR}/exec.log`);
  }
  return [...lines, `echo ${quote(row.output ?? '')}`].join('\n');
}

function placementOf(row: FileRow): Placement[] {
  const open = row.readable === 'all';
  const { path, owner } = row;
  if (row.kind === 'dir') return [{ path, owner, mode: open ? '755' : '700' }];
  if (row.kind === 'file') {
    const content = path === SUDOERS_FILE ? [row.content, ...MACHINE_SUDOERS].join('\n') : row.content;
    // sudo の設定は、本物と同じく読み取り専用（0440）で置く
    const closed = owner === ROOT ? '440' : '600';
    return [{ path, owner, mode: open ? '644' : closed, content }];
  }
  // 出力を持たないプログラムは、擬似シェルが自前で解釈するコマンドの置き場所。本物の Linux には実物があるので置かない
  return row.output === null ? [] : [{ path, owner, mode: '755', content: programScript(row) }];
}

function fileCommands(db: Database): string[] {
  const rows = db.selectObjects(
    'SELECT f.path, f.kind, f.owner, f.readable, f.content, p.needs_root AS needsRoot, p.output FROM files f LEFT JOIN programs p ON p.path = f.path ORDER BY f.path',
  ) as unknown as FileRow[];
  const placements = rows.flatMap(placementOf);
  const directories = placements.filter((placement) => placement.content === undefined);
  return [
    `mkdir -p ${directories.map((directory) => quote(directory.path)).join(' ')}`,
    ...placements.flatMap((placement) => (placement.content === undefined ? [] : writeFile(placement.path, placement.content))),
    ...grouped('chown', placements, (placement) => placement.owner),
    ...grouped('chmod', placements, (placement) => placement.mode),
  ];
}

/** 初期データを機械へ反映するスクリプト。途中で失敗したら止まる */
function provisionScript(db: Database): string {
  const host = hostname(db);
  const hosts = `127.0.0.1 localhost ${host}`;
  return [
    'set -e',
    `date -s ${quote(CLOCK)} > /dev/null`,
    `hostname ${quote(host)}`,
    `echo ${quote(hosts)} > /etc/hosts`,
    ...accountCommands(db),
    ...fileCommands(db),
    // 置いた設定を sudo が読めることを確かめる。読めなければここで止まる
    'visudo -c > /dev/null',
  ].join('\n');
}

export async function provision(machine: Machine, db: Database): Promise<void> {
  const [status, stdout = '', stderr = ''] = await machine.call('provision', provisionScript(db), PROVISION_TIMEOUT_MS);
  if (status !== '0') throw new Error(`演習用の機械に初期データを反映できません（終了コード ${status ?? '不明'}）：${[stdout, stderr].join('\n').trim()}`);
}

/** 機械のファイルを、初期データを反映した直後の状態へ戻す。利用者の操作を重ねた層を捨てるだけなので、すぐに終わる */
export async function reset(machine: Machine): Promise<void> {
  const [status] = await machine.call('reset', '', RESET_TIMEOUT_MS);
  if (status !== '0') throw new Error(`演習用の機械を初期状態へ戻せません（終了コード ${status ?? '不明'}）`);
}
