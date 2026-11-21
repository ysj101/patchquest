// 擬似シェルが扱う機械の状態（利用者・ファイル・プログラム）の読み書き。状態は交換の外（SQLite）に持ち、交換のたびに読む
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { Database } from '../../runtimes/browser/sqlite';

export const ROOT = 'root';
export const SUDOERS_FILE = '/etc/sudoers';
export const SUDOERS_DIR = '/etc/sudoers.d';
/** 名前だけで実行できるプログラムを探す場所（先頭から順に探す） */
export const PATH_DIRS = ['/usr/local/sbin', '/usr/local/bin'] as const;

export interface Account {
  name: string;
  uid: number;
  home: string;
  groups: string[];
}

export interface FileNode {
  path: string;
  kind: 'dir' | 'file' | 'program';
  owner: string;
  readable: 'all' | 'owner';
  content: string;
}

/** seed から作る架空のプログラム。実行すると決まった出力を返すだけで、機械の状態は変えない */
export interface Program {
  path: string;
  needsRoot: boolean;
  output: string;
}

function withGroups(db: Database, row: Omit<Account, 'groups'> | undefined): Account | null {
  if (!row) return null;
  return { ...row, groups: db.selectValues('SELECT grp FROM memberships WHERE account = ? ORDER BY grp', [row.name]) as string[] };
}

export function findAccount(db: Database, name: string): Account | null {
  return withGroups(db, db.selectObject('SELECT name, uid, home FROM accounts WHERE name = ?', [name]) as Omit<Account, 'groups'> | undefined);
}

/** セッションから解決した主体（利用者キー）を、機械の利用者へ対応付ける。未ログインは null */
export function currentAccount(ctx: ServerContext): Account | null {
  if (!ctx.principal) return null;
  return withGroups(ctx.db, ctx.db.selectObject('SELECT name, uid, home FROM accounts WHERE actor = ?', [ctx.principal]) as Omit<Account, 'groups'> | undefined);
}

export function rootAccount(db: Database): Account {
  const root = findAccount(db, ROOT);
  if (!root) throw new Error('機械に root がいません');
  return root;
}

export function hostname(db: Database): string {
  const name = db.selectValue("SELECT value FROM machine WHERE key = 'hostname'");
  if (typeof name !== 'string') throw new Error('機械にホスト名がありません');
  return name;
}

const NODE_COLUMNS = 'path, kind, owner, readable, content';

export function findNode(db: Database, path: string): FileNode | null {
  return (db.selectObject(`SELECT ${NODE_COLUMNS} FROM files WHERE path = ?`, [path]) as FileNode | undefined) ?? null;
}

/** ディレクトリの直下にあるもの（名前順） */
export function childrenOf(db: Database, dir: string): FileNode[] {
  return db.selectObjects(`SELECT ${NODE_COLUMNS} FROM files WHERE parent = ? ORDER BY path`, [dir]) as unknown as FileNode[];
}

export function findProgram(db: Database, path: string): Program | null {
  const row = db.selectObject('SELECT path, needs_root AS needsRoot, output FROM programs WHERE path = ?', [path]) as { path: string; needsRoot: number; output: string } | undefined;
  return row ? { path: row.path, needsRoot: row.needsRoot === 1, output: row.output } : null;
}

/** 読めるのは、誰でも読めるもの・自分のもの。root はすべて読める */
export const canRead = (node: FileNode, as: Account): boolean => as.name === ROOT || node.readable === 'all' || node.owner === as.name;

export function writeFile(db: Database, path: string, content: string): void {
  db.exec({ sql: "UPDATE files SET content = ? WHERE path = ? AND kind = 'file'", bind: [content, path] });
}

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** パスを絶対パスにそろえる。~ はホーム、相対パスは cwd から解決し、. と .. を畳む */
export function normalizePath(cwd: string, target: string, home: string): string {
  let from = target;
  if (target === '~') from = home;
  else if (target.startsWith('~/')) from = `${home}/${target.slice(2)}`;
  else if (!target.startsWith('/')) from = `${cwd}/${target}`;
  const parts: string[] = [];
  for (const part of from.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}
