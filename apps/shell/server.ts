// 擬似シェルの教材ロジック。コマンド行 1 つを 1 回のやり取り（POST /sh）として受け、端末の出力と終了コードを返す。
// 主体はセッションから解決する。カレントディレクトリは要求に載せて受け取り、記録した操作だけを再生しても同じ場所を指すようにする
import type { AppRequest, AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { json } from '../shared/http';
import { COMMANDS, resolveTarget, runTarget } from './exec';
import { PATH_DIRS, currentAccount, findNode, hostname, type Account } from './model';
import { MAX_LINE_LENGTH, fail, ok, tokenize, type Env, type Output } from './shell';
import { SUDO_USAGE, sudo } from './sudo';

const HELP_USAGE = { usage: 'help', summary: '使えるコマンドを一覧する' };

function help(): Output {
  const rows = [...Object.values(COMMANDS), SUDO_USAGE, HELP_USAGE].map(({ usage, summary }) => `  ${usage}\n      ${summary}`);
  return ok(['使えるコマンド：', ...rows, `ほかに、${PATH_DIRS.join(' と ')} にあるプログラムを名前で実行できます。`, 'パイプ・リダイレクト・変数・ワイルドカードには対応していません。'].join('\n'));
}

/** コマンド行を解釈して実行する。未実装のコマンドは command not found を返し、黙って無視しない */
export function runLine(env: Env, line: string): Output {
  if (line.length > MAX_LINE_LENGTH) return fail(`sh: 入力が長すぎます（${MAX_LINE_LENGTH} 文字まで）`, 2);
  const tokens = tokenize(line);
  if ('error' in tokens) return fail(tokens.error, 2);
  const [name, ...args] = tokens.words;
  if (name === undefined) return ok();
  if (name === 'sudo') return sudo(env, args);
  if (name === 'help') return args.length > 0 ? fail('help: 引数は受け取りません', 2) : help();
  const target = resolveTarget(env, name);
  return target ? runTarget(env, target, args) : fail(`sh: ${name}: command not found`, 127);
}

/** 要求の本文（{ line, cwd? }）を読む。cwd を省くとホームから始める。形が違えば理由を返す */
function parseBody(ctx: ServerContext, body: AppRequest['body'], account: Account): { line: string; cwd: string } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: '本文は { "line": "コマンド行" } の形で送ってください' };
  const { line, cwd = account.home } = body;
  if (typeof line !== 'string' || /[\r\n]/.test(line)) return { error: 'line には 1 行のコマンド行を文字列で入れてください' };
  if (typeof cwd !== 'string' || findNode(ctx.db, cwd)?.kind !== 'dir') return { error: 'cwd には、実在するディレクトリの絶対パスを入れてください' };
  return { line, cwd };
}

export function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  if (req.path !== '/sh') return json(404, { error: '見つかりません' });
  const account = currentAccount(ctx);
  if (!account) return json(401, { error: 'ログインが必要です' });
  // 端末を開いたときの表示（プロンプト）に使う
  if (req.method === 'GET') return json(200, { user: account.name, host: hostname(ctx.db), cwd: account.home });
  if (req.method !== 'POST') return json(405, { error: '許可されていない操作です' });

  const input = parseBody(ctx, req.body, account);
  if ('error' in input) return json(400, { error: input.error });
  const output = runLine({ ctx, user: account, as: account, cwd: input.cwd }, input.line);
  return json(200, { stdout: output.stdout, stderr: output.stderr, exit: output.exit, cwd: output.cwd ?? input.cwd, changed: output.changed ?? false });
}
