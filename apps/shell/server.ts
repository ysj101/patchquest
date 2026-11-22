// 擬似シェルの教材ロジック。コマンド行 1 つを 1 回のやり取り（POST /sh）として受け、端末の出力と終了コードを返す。
// エディタ（visudo）だけは、開くやり取りと、編集（edits。行の書き換え・削除・追加）を付けて保存するやり取りの 2 回になる。
// 主体はセッションから解決する。カレントディレクトリは要求に載せて受け取り、記録した操作だけを再生しても同じ場所を指すようにする
import type { AppRequest, AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { json } from '../shared/http';
import { COMMANDS, resolveTarget, runTarget } from './exec';
import { PATH_DIRS, currentAccount, findNode, hostname, type Account } from './model';
import { parseEdits, type LineEdit } from './edits';
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
  if (name === 'su') return fail('su: この端末では利用者を切り替えられません。演習画面の「表示する利用者」で切り替えてください');
  if (name === 'help') return args.length > 0 ? fail('help: 引数は受け取りません', 2) : help();
  const target = resolveTarget(env, name);
  return target ? runTarget(env, target, args) : fail(`sh: ${name}: command not found`, 127);
}

/** エディタを開くコマンド行（sudo を付けた形も含む）。編集は、このコマンド行にだけ付けられる */
const EDITOR_LINE = /^\s*(?:sudo\s+)?(?:\/usr\/sbin\/)?visudo(?:\s|$)/;
export interface Input {
  line: string;
  cwd: string;
  edits: LineEdit[] | null;
}

/**
 * 要求の本文（{ line, cwd?, edits? }）を読む。cwd を省くとホーム（home）から始める。形が違えば理由を返す。
 * validCwd は、cwd として受け取れる場所かどうか。本物の Linux で動かすアプリ（apps/shell/linux）も同じ形の要求を受けるので共有する
 */
function parseBody(body: AppRequest['body'], home: string, validCwd: (cwd: string) => boolean): Input | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: '本文は { "line": "コマンド行" } の形で送ってください' };
  const { line, cwd = home } = body;
  if (typeof line !== 'string' || /[\r\n]/.test(line)) return { error: 'line には 1 行のコマンド行を文字列で入れてください' };
  if (typeof cwd !== 'string' || !validCwd(cwd)) return { error: 'cwd には、実在するディレクトリの絶対パスを入れてください' };
  const parsed = parseEdits(body.edits);
  return 'error' in parsed ? parsed : { line, cwd, edits: parsed.edits };
}

/**
 * 端末の要求の入口。コマンド行の要求（POST /sh）なら、ログインした利用者と入力を返す。
 * それ以外（端末を開く問い合わせ・未ログイン・形の違う要求）は、その場で返す応答を返す
 */
export function terminalRequest(ctx: ServerContext, req: AppRequest, validCwd: (cwd: string) => boolean): { response: AppResponse } | { account: Account; input: Input } {
  if (req.path !== '/sh') return { response: json(404, { error: '見つかりません' }) };
  const account = currentAccount(ctx);
  if (!account) return { response: json(401, { error: 'ログインが必要です' }) };
  // 端末を開いたときの表示（プロンプト）に使う
  if (req.method === 'GET') return { response: json(200, { user: account.name, host: hostname(ctx.db), cwd: account.home }) };
  if (req.method !== 'POST') return { response: json(405, { error: '許可されていない操作です' }) };
  const input = parseBody(req.body, account.home, validCwd);
  return 'error' in input ? { response: json(400, { error: input.error }) } : { account, input };
}

export function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  const opened = terminalRequest(ctx, req, (cwd) => findNode(ctx.db, cwd)?.kind === 'dir');
  if ('response' in opened) return opened.response;
  const { account, input } = opened;
  if (input.edits && !EDITOR_LINE.test(input.line)) return json(400, { error: 'edits は、visudo のコマンド行にだけ付けられます' });
  const output = runLine({ ctx, user: account, as: account, cwd: input.cwd, edits: input.edits }, input.line);
  const result = { stdout: output.stdout, stderr: output.stderr, exit: output.exit, cwd: output.cwd ?? input.cwd, changed: output.changed ?? false };
  return json(200, output.editor ? { ...result, editor: output.editor } : result);
}
