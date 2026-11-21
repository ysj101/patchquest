// コマンドの登録簿と実行。実行できるのは、ここに登録したコマンドと、初期データが置いた架空のプログラムだけ（任意のコードは実行しない）
import { INSPECT_COMMANDS } from './commands';
import { PATH_DIRS, ROOT, baseName, findProgram, normalizePath, type Program } from './model';
import { fail, ok, type Command, type Env, type Output } from './shell';
import { visudo } from './visudo';

/** 固定のコマンド集合。ここにない名前は、プログラムとしても見つからなければ command not found にする */
export const COMMANDS: Record<string, Command> = { ...INSPECT_COMMANDS, visudo };

export type Target = { name: string; path: string | null; command: Command } | { name: string; path: string; program: Program };

/** 名前（または絶対・相対パス）から、実行するものを探す。名前だけのときは登録簿、次に PATH_DIRS の順に探す */
export function resolveTarget(env: Env, word: string): Target | null {
  if (!word.includes('/')) {
    const command = Object.hasOwn(COMMANDS, word) ? COMMANDS[word] : undefined;
    if (command) return { name: word, path: command.path, command };
    for (const dir of PATH_DIRS) {
      const program = findProgram(env.ctx.db, `${dir}/${word}`);
      if (program) return { name: word, path: program.path, program };
    }
    return null;
  }
  const path = normalizePath(env.cwd, word, env.user.home);
  const [name, command] = Object.entries(COMMANDS).find(([, candidate]) => candidate.path === path) ?? [];
  if (name !== undefined && command) return { name, path, command };
  const program = findProgram(env.ctx.db, path);
  return program ? { name: baseName(path), path, program } : null;
}

/** 架空のプログラムを実行する。root が要るものを root 以外で実行したら断る。実行できたら観測イベントに記録する */
function runProgram(env: Env, target: Extract<Target, { program: Program }>, args: string[]): Output {
  if (args.length > 0) return fail(`${target.name}: 引数は受け取りません`, 2);
  if (target.program.needsRoot && env.as.name !== ROOT) return fail(`${target.name}: この操作には root の権限が必要です`);
  env.ctx.emit('shell.exec', { program: target.path, user: env.user.name, runAs: env.as.name });
  return ok(target.program.output);
}

export function runTarget(env: Env, target: Target, args: string[]): Output {
  return 'command' in target ? target.command.run(env, args) : runProgram(env, target, args);
}
