// sudo のモデル。設定（/etc/sudoers と /etc/sudoers.d の中身）を毎回読み、許可されたコマンドだけを root として実行する。
// 判断（許可・拒否と理由）は観測イベントに記録する。本物の権限昇格は起こさず、判断だけをモデルで表す（spec §14）
import type { Database } from '../../runtimes/browser/sqlite';
import { resolveTarget, runTarget } from './exec';
import { SUDOERS_DIR, SUDOERS_FILE, childrenOf, findNode, hostname, rootAccount } from './model';
import { fail, ok, type Env, type Output } from './shell';
import { decide, describeEntry, entriesFor, parseSudoers, type SudoEntry } from './sudoers';

type PolicyEntry = SudoEntry & { file: string };

/**
 * 設定を読む。読めない設定は保存の時点（初期データの生成と visudo）で断っているので、ここで読めないのは機械の状態が壊れているとき。
 * 黙って許可・拒否を決めずに例外にする（応答は 500 になる）
 */
function loadPolicy(db: Database): PolicyEntry[] {
  const main = findNode(db, SUDOERS_FILE);
  const files = [...(main ? [main] : []), ...childrenOf(db, SUDOERS_DIR).filter((node) => node.kind === 'file')];
  const policy: PolicyEntry[] = [];
  for (const file of files) {
    const { entries, errors } = parseSudoers(file.content);
    if (errors[0]) throw new Error(`${file.path} の ${errors[0].line} 行目を読めません：${errors[0].message}`);
    policy.push(...entries.map((entry) => ({ ...entry, file: file.path })));
  }
  return policy;
}

/** sudo -l：この利用者が sudo で実行できるコマンドの一覧 */
function list(env: Env, policy: PolicyEntry[]): Output {
  const host = hostname(env.ctx.db);
  const entries = entriesFor(policy, env.user);
  if (entries.length === 0) return fail(`Sorry, user ${env.user.name} may not run sudo on ${host}.`);
  return ok([`User ${env.user.name} may run the following commands on ${host}:`, ...entries.map(describeEntry)].join('\n'));
}

function run(env: Env, policy: PolicyEntry[], word: string, args: string[]): Output {
  const target = resolveTarget(env, word);
  // シェルに組み込みのコマンド（cd など）は実行ファイルがないので、sudo からは見つからない
  const command = target?.path ?? null;
  if (!target || command === null) return fail(`sudo: ${word}: command not found`);
  const record = (decision: 'allow' | 'deny', reason: string) => env.ctx.emit('sudo.decision', { user: env.user.name, command, runAs: 'root', decision, reason });
  const entry = decide(policy, env.user, command);
  if (!entry) {
    record('deny', '許可する設定がない');
    return fail(`Sorry, user ${env.user.name} is not allowed to execute '${command}' as root on ${hostname(env.ctx.db)}.`);
  }
  const where = `${entry.file} の ${entry.line} 行目`;
  if (!entry.nopasswd) {
    record('deny', `${where}はパスワードを求めるが、この端末では入力できない`);
    return fail('sudo: a password is required');
  }
  record('allow', `${where}で許可されている`);
  return runTarget({ ...env, as: rootAccount(env.ctx.db) }, target, args);
}

export const SUDO_USAGE = { usage: 'sudo -l ／ sudo コマンド', summary: '-l で自分が sudo で実行できるコマンドを一覧する。コマンドを付けると root として実行する' };

export function sudo(env: Env, args: string[]): Output {
  const [first, ...rest] = args;
  if (first === undefined) return fail('usage: sudo -l | sudo コマンド [引数]', 2);
  const policy = loadPolicy(env.ctx.db);
  if (first === '-l') return rest.length > 0 ? fail('sudo: -l に引数は付けられません', 2) : list(env, policy);
  if (first.startsWith('-')) return fail(`sudo: オプション ${first} には対応していません（使えるのは -l だけです）`, 2);
  return run(env, policy, first, rest);
}
