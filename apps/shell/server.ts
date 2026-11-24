// 擬似シェルの教材ロジック。コマンド行 1 つを 1 回のやり取り（POST /sh）として受け、端末の出力と終了コードを返す。
// エディタ（visudo）だけは、開くやり取りと、編集（edits。行の書き換え・削除・追加）を付けて保存するやり取りの 2 回になる。
// 主体はセッションから解決する。カレントディレクトリは要求に載せて受け取り、記録した操作だけを再生しても同じ場所を指すようにする
import type { AppRequest, AppResponse } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { json } from '../shared/http';
import { COMMANDS, resolveTarget, runTarget } from './exec';
import { PATH_DIRS, baseName, canRead, childrenOf, currentAccount, findNode, hostname, normalizePath, type Account } from './model';
import { parseEdits, type LineEdit } from './edits';
import { MAX_LINE_LENGTH, NAMES_PATH, fail, ok, tokenize, type Env, type Output } from './shell';
import { SUDO_USAGE, sudo } from './sudo';

const HELP_USAGE = { usage: 'help', summary: '使えるコマンドを一覧する' };

function help(): Output {
  const rows = [...Object.values(COMMANDS), SUDO_USAGE, HELP_USAGE].map(({ usage, summary }) => `  ${usage}\n      ${summary}`);
  return ok(['使えるコマンド：', ...rows, `ほかに、${PATH_DIRS.join(' と ')} にあるプログラムを名前で実行できます。`, 'パイプ・リダイレクト・変数・ワイルドカードには対応していません。'].join('\n'));
}

/** コマンド行を解釈して実行する。未実装のコマンドは command not found を返し、黙って無視しない */
function runLine(env: Env, line: string): Output {
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

/** 名前を尋ねる要求の本文から、調べるディレクトリを読む。形が違えば null */
function askedDir(body: AppRequest['body']): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const { dir } = body;
  return typeof dir === 'string' && dir.startsWith('/') && !/[\r\n]/.test(dir) ? dir : null;
}

/** 端末を開いたときの応答。プロンプトの表示と、Tab キーでの補完に使うコマンド名（commands）を返す */
export function sessionResponse(ctx: ServerContext, account: Account, commands: string[]): AppResponse {
  return json(200, { user: account.name, host: hostname(ctx.db), cwd: account.home, commands });
}

/**
 * 端末の要求の入口。ログインした利用者と、コマンド行の要求（POST /sh）の入力を返す。端末を開く問い合わせ（GET /sh）は input が null。
 * 名前を尋ねる要求（NAMES_PATH）は、調べるディレクトリ（dir）を返す。それ以外（未ログイン・形の違う要求）は、その場で返す応答を返す
 */
export function terminalRequest(ctx: ServerContext, req: AppRequest, validCwd: (cwd: string) => boolean): { response: AppResponse } | { account: Account; input: Input | null } | { account: Account; dir: string } {
  if (req.path !== '/sh' && req.path !== NAMES_PATH) return { response: json(404, { error: '見つかりません' }) };
  const account = currentAccount(ctx);
  if (!account) return { response: json(401, { error: 'ログインが必要です' }) };
  if (req.method === 'GET' && req.path === '/sh') return { account, input: null };
  if (req.method !== 'POST') return { response: json(405, { error: '許可されていない操作です' }) };
  if (req.path === NAMES_PATH) {
    const dir = askedDir(req.body);
    return dir === null ? { response: json(400, { error: 'dir には、ディレクトリの絶対パスを入れてください' }) } : { account, dir };
  }
  const input = parseBody(req.body, account.home, validCwd);
  return 'error' in input ? { response: json(400, { error: input.error }) } : { account, input };
}

/** 名前だけで実行できるもの（登録したコマンド・sudo・help と、PATH_DIRS にあるプログラム）。名前順 */
function commandNames(ctx: ServerContext): string[] {
  const programs = PATH_DIRS.flatMap((dir) => childrenOf(ctx.db, dir)).filter((node) => node.kind === 'program');
  const names = [...Object.keys(COMMANDS), 'sudo', 'help', ...programs.map((node) => baseName(node.path))];
  names.sort();
  return names;
}

/** ディレクトリにある名前（ディレクトリは末尾に /）。ディレクトリがない・利用者が読めないときは空 */
function namesIn(ctx: ServerContext, account: Account, dir: string): string[] {
  const node = findNode(ctx.db, normalizePath('/', dir, account.home));
  if (node?.kind !== 'dir' || !canRead(node, account)) return [];
  return childrenOf(ctx.db, node.path).map((child) => `${baseName(child.path)}${child.kind === 'dir' ? '/' : ''}`);
}

export function handle(ctx: ServerContext, req: AppRequest): AppResponse {
  const opened = terminalRequest(ctx, req, (cwd) => findNode(ctx.db, cwd)?.kind === 'dir');
  if ('response' in opened) return opened.response;
  if ('dir' in opened) return json(200, { names: namesIn(ctx, opened.account, opened.dir) });
  const { account, input } = opened;
  if (!input) return sessionResponse(ctx, account, commandNames(ctx));
  if (input.edits && !EDITOR_LINE.test(input.line)) return json(400, { error: 'edits は、visudo のコマンド行にだけ付けられます' });
  const output = runLine({ ctx, user: account, as: account, cwd: input.cwd, edits: input.edits }, input.line);
  const result = { stdout: output.stdout, stderr: output.stderr, exit: output.exit, cwd: output.cwd ?? input.cwd, changed: output.changed ?? false };
  return json(200, output.editor ? { ...result, editor: output.editor } : result);
}
