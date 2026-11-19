// 調べるためのコマンド（whoami・id・pwd・cd・ls・cat）。機械の状態を読むだけで、変えない
import { baseName, canRead, childrenOf, findNode, normalizePath, type FileNode } from './model';
import { fail, ok, rejectOptions, type Command, type Env, type Output } from './shell';

const resolve = (env: Env, target: string): string => normalizePath(env.cwd, target, env.user.home);

const whoami: Command = {
  path: '/usr/bin/whoami',
  usage: 'whoami',
  summary: 'いまの利用者の名前を表示する',
  run: (env, args) => (args.length > 0 ? fail('whoami: 引数は受け取りません', 2) : ok(env.as.name)),
};

const id: Command = {
  path: '/usr/bin/id',
  usage: 'id',
  summary: 'いまの利用者の番号と、所属するグループを表示する',
  run: (env, args) => (args.length > 0 ? fail('id: 引数は受け取りません', 2) : ok(`uid=${env.as.uid}(${env.as.name}) groups=${env.as.groups.join(',')}`)),
};

const pwd: Command = {
  path: null,
  usage: 'pwd',
  summary: 'いまいるディレクトリを表示する',
  run: (env, args) => (args.length > 0 ? fail('pwd: 引数は受け取りません', 2) : ok(env.cwd)),
};

/** 開けるディレクトリを探す。なければ、本物のシェルと同じ形の理由を返す */
function openDir(env: Env, name: string, target: string): FileNode | Output {
  const node = findNode(env.ctx.db, resolve(env, target));
  if (!node) return fail(`${name}: ${target}: No such file or directory`);
  if (node.kind !== 'dir') return fail(`${name}: ${target}: Not a directory`);
  if (!canRead(node, env.as)) return fail(`${name}: ${target}: Permission denied`);
  return node;
}

const cd: Command = {
  path: null,
  usage: 'cd [ディレクトリ]',
  summary: 'ディレクトリを移動する（省略するとホームへ戻る）',
  run(env, args) {
    if (args.length > 1) return fail('cd: 引数が多すぎます', 2);
    const dir = openDir(env, 'cd', args[0] ?? '~');
    return 'exit' in dir ? dir : { ...ok(), cwd: dir.path };
  },
};

/** 一覧の 1 件。ディレクトリには /、実行できるものには * を付ける */
function listed(node: FileNode): string {
  const marks = { dir: '/', program: '*', file: '' } as const;
  return `${baseName(node.path)}${marks[node.kind]}`;
}

const ls: Command = {
  path: '/usr/bin/ls',
  usage: 'ls [パス]',
  summary: 'ディレクトリの中身を一覧する（/ はディレクトリ、* は実行できるもの）',
  run(env, args) {
    const rejected = rejectOptions('ls', args);
    if (rejected) return rejected;
    if (args.length > 1) return fail('ls: パスは 1 つだけ指定できます', 2);
    const target = args[0] ?? '.';
    const node = findNode(env.ctx.db, resolve(env, target));
    if (node && node.kind !== 'dir') return ok(target);
    const dir = openDir(env, 'ls', target);
    return 'exit' in dir ? dir : ok(childrenOf(env.ctx.db, dir.path).map(listed).join('\n'));
  },
};

/** ファイル 1 つの中身。読めなければ理由を返す */
function readFile(env: Env, target: string): { content: string } | { error: string } {
  const node = findNode(env.ctx.db, resolve(env, target));
  if (!node) return { error: `cat: ${target}: No such file or directory` };
  if (node.kind === 'dir') return { error: `cat: ${target}: Is a directory` };
  if (!canRead(node, env.as)) return { error: `cat: ${target}: Permission denied` };
  if (node.kind === 'program') return { error: `cat: ${target}: 実行ファイルの中身は表示できません` };
  return { content: node.content };
}

const cat: Command = {
  path: '/usr/bin/cat',
  usage: 'cat ファイル...',
  summary: 'ファイルの中身を表示する',
  run(env, args) {
    const rejected = rejectOptions('cat', args);
    if (rejected) return rejected;
    if (args.length === 0) return fail('cat: ファイルを指定してください', 2);
    const results = args.map((target) => readFile(env, target));
    return {
      stdout: results.flatMap((result) => ('content' in result ? [result.content] : [])).join('\n'),
      stderr: results.flatMap((result) => ('error' in result ? [result.error] : [])).join('\n'),
      exit: results.some((result) => 'error' in result) ? 1 : 0,
    };
  },
};

export const INSPECT_COMMANDS: Record<string, Command> = { whoami, id, pwd, cd, ls, cat };
