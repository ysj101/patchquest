// ファイルの 1 行を書き換える疑似エディタ（edit）。汎用のエディタではなく、行番号を指定して 1 行だけを置き換える。
// 機械の状態を変えるコマンドはこれだけで、変えたときは応答の changed が true になる（修正の記録の条件に使う）
import { SUDOERS_DIR, SUDOERS_FILE, canRead, canWrite, findNode, normalizePath, writeFile, type FileNode } from './model';
import { fail, ok, type Command, type Env, type Output } from './shell';
import { parseSudoers } from './sudoers';

const isSudoers = (path: string): boolean => path === SUDOERS_FILE || path.startsWith(`${SUDOERS_DIR}/`);

/** 行番号つきの表示（cat -n と同じ形） */
const numbered = (content: string): string => content.split('\n').map((text, index) => `${String(index + 1).padStart(6)}  ${text}`).join('\n');

function openFile(env: Env, target: string): FileNode | Output {
  const node = findNode(env.ctx.db, normalizePath(env.cwd, target, env.user.home));
  if (!node) return fail(`edit: ${target}: No such file or directory`);
  if (node.kind !== 'file') return fail(`edit: ${target}: 書き換えられるのは通常のファイルだけです`);
  if (!canRead(node, env.as)) return fail(`edit: ${target}: Permission denied`);
  return node;
}

/** 書き換え後の内容を保存する。sudo の設定は、本物の visudo と同じく構文を確かめてから保存し、読めない内容では保存しない */
function replaceLine(env: Env, node: FileNode, lineNumber: number, text: string): Output {
  if (!canWrite(node, env.as)) return fail(`edit: ${node.path}: Permission denied`);
  const lines = node.content.split('\n');
  if (lines[lineNumber - 1] === text) return ok(`${node.path}: ${lineNumber} 行目は同じ内容です（変更していません）`);
  lines[lineNumber - 1] = text;
  const content = lines.join('\n');
  const error = isSudoers(node.path) ? parseSudoers(content).errors[0] : undefined;
  if (error) return fail(`edit: ${node.path}:${error.line}: 構文エラー：${error.message}\nedit: 変更は保存していません`);
  writeFile(env.ctx.db, node.path, content);
  env.ctx.emit('file.changed', { path: node.path, line: lineNumber, user: env.user.name, runAs: env.as.name });
  return { ...ok(`${node.path}: ${lineNumber} 行目を書き換えました`), changed: true };
}

export const edit: Command = {
  path: '/usr/bin/edit',
  usage: 'edit ファイル [行番号 新しい内容]',
  summary: 'ファイルを行番号つきで表示する。行番号と内容を付けると、その 1 行を書き換える',
  run(env, args) {
    const [target, lineArg, ...words] = args;
    if (target === undefined) return fail('edit: ファイルを指定してください（例：edit メモ.txt 2 新しい内容）', 2);
    const node = openFile(env, target);
    if ('exit' in node) return node;
    if (lineArg === undefined) return ok(numbered(node.content));
    const count = node.content.split('\n').length;
    const lineNumber = /^[1-9]\d{0,5}$/.test(lineArg) ? Number(lineArg) : 0;
    if (lineNumber < 1 || lineNumber > count) return fail(`edit: 行番号は 1〜${count} で指定してください（指定：${lineArg}）`, 2);
    if (words.length === 0) return fail('edit: 新しい内容を指定してください（空にするときは \'\' と書きます）', 2);
    return replaceLine(env, node, lineNumber, words.join(' '));
  },
};
