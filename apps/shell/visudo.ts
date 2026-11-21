// sudo の設定を書き換えるエディタ（visudo）。本物と同じく root だけが使え、保存の前に構文を確かめて、読めない内容では保存しない。
// 端末は 1 コマンド＝1 回のやり取りなので、開く（内容を返す）と保存する（書き換えた行を受け取る）を、同じコマンド行の 2 回のやり取りで表す。
// 機械の状態を変えるコマンドはこれだけで、変えたときは応答の changed が true になる（修正の記録の条件に使う）
import { ROOT, SUDOERS_FILE, findNode, normalizePath, writeFile, type FileNode } from './model';
import { fail, ok, type Command, type Env, type LineEdit, type Output } from './shell';
import { parseSudoers } from './sudoers';

const USAGE = 'usage: visudo [-f ファイル]';

/** 引数から、編集するファイルを決める。省くと /etc/sudoers */
function targetPath(args: readonly string[]): string | null {
  if (args.length === 0) return SUDOERS_FILE;
  const [flag, path] = args;
  return flag === '-f' && path !== undefined && args.length === 2 ? path : null;
}

function openFile(env: Env, target: string): FileNode | Output {
  if (env.as.name !== ROOT) return fail(`visudo: ${target}: Permission denied`);
  const node = findNode(env.ctx.db, normalizePath(env.cwd, target, env.user.home));
  if (!node) return fail(`visudo: ${target}: No such file or directory`);
  return node.kind === 'file' ? node : fail(`visudo: ${target}: 編集できるのは通常のファイルだけです`);
}

/** 書き換えた行を当てはめて保存する。構文を読めないときは保存せず、どの行が読めないかを返す */
function save(env: Env, node: FileNode, edits: readonly LineEdit[]): Output {
  const lines = node.content.split('\n');
  const outside = edits.find((edit) => edit.line > lines.length);
  if (outside) return fail(`visudo: 行番号は 1〜${lines.length} で指定してください（指定：${outside.line}）`, 2);
  const changed = edits.filter((edit) => lines[edit.line - 1] !== edit.text);
  if (changed.length === 0) return ok(`visudo: ${node.path} unchanged`);
  for (const edit of changed) lines[edit.line - 1] = edit.text;
  const content = lines.join('\n');
  const error = parseSudoers(content).errors[0];
  if (error) return fail(`visudo: ${node.path}:${error.line}: 構文エラー：${error.message}\nvisudo: 変更は保存していません`);
  writeFile(env.ctx.db, node.path, content);
  const changedLines = changed.map((edit) => edit.line);
  env.ctx.emit('file.changed', { path: node.path, lines: changedLines, user: env.user.name, runAs: env.as.name });
  return { ...ok(`visudo: ${node.path} の ${changedLines.join('・')} 行目を保存しました`), changed: true };
}

export const visudo: Command = {
  path: '/usr/sbin/visudo',
  usage: 'visudo [-f ファイル]',
  summary: 'sudo の設定を編集画面で開く（root だけが使えるので、sudo を付けて実行する）。保存するときに構文を確かめる',
  run(env, args) {
    const target = targetPath(args);
    if (target === null) return fail(USAGE, 2);
    const node = openFile(env, target);
    if ('exit' in node) return node;
    return env.edits === null ? { ...ok(), editor: { path: node.path, lines: node.content.split('\n') } } : save(env, node, env.edits);
  },
};
