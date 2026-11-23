// 教材アプリ「Linux 端末」の教材ロジック。擬似シェルと同じ形の要求（POST /sh { line, cwd?, edits? }）を受け、
// コマンド行を演習用の機械（本物の Linux）の中で、ログインした利用者として実行する。sudo も visudo も sudoedit も本物が動く。
// 主体はセッションから解決する。機械の状態を変えたかどうかは、実行の前後でファイルを比べて決める
import type { AppRequest, AppResponse } from '../../../platform/contract';
import type { ServerContext } from '../../../runtimes/browser/app-module';
import { json } from '../../shared/http';
import type { LineEdit } from '../edits';
import type { Account } from '../model';
import { sessionResponse, terminalRequest, type Input } from '../server';
import { MAX_LINE_LENGTH, type EditorFile } from '../shell';
import { emitChanges, emitExecutions, emitSudoDecisions } from './events';

/** 機械がコマンド行を止めるまでの時間（guest/agent の LIMIT）より長く待つ */
const RUN_TIMEOUT_MS = 4500;
/** visudo が、構文エラーのあとに入力を待って出す問い。この端末では答えられないので、保存せずに終わる */
const VISUDO_PROMPT = /What now\? /g;
/** エディタを開いて、何も変えずに閉じたときの visudo と sudoedit の知らせ。編集画面を開く操作では出さない */
const EDITOR_UNCHANGED = /^(?:visudo: .*\.tmp|sudoedit: .*) unchanged\n?/m;

/** エディタ（guest/editor）が残す結果。applied は visudo の作業用の写しを、written は sudoedit の作業用の写しを書き換えた */
type EditorResult = '' | 'opened' | 'applied' | 'written' | 'same' | 'range';

interface Ran {
  exit: number;
  stdout: string;
  stderr: string;
  cwd: string;
  editorDump: string;
  editorResult: EditorResult;
  changed: string[];
}

const withoutLastNewline = (text: string): string => (text.endsWith('\n') ? text.slice(0, -1) : text);

/** エディタが渡した内容（1 行目がファイルのパス、残りが中身） */
function openedFile(dump: string): EditorFile {
  const [path = '', ...lines] = withoutLastNewline(dump).split('\n');
  return { path, lines };
}

/**
 * 編集を付けた要求の終了コード。visudo は、保存しなかったときも 0 で終わることがあるので、エディタの結果と実際の変化から決める。
 * 範囲外の行は 2。書き換えたのに保存されなかった（構文エラー）、エディタが開かれなかった（断られた）ときは失敗にする
 */
function saveExit(ran: Ran): { exit: number; note?: string } {
  if (ran.editorResult === 'range') return { exit: 2 };
  // sudoedit は構文を確かめないので、書き換えたものがそのまま保存される。成否は sudoedit の終了コードで分かる
  if (ran.editorResult === 'same' || ran.editorResult === 'written' || ran.changed.length > 0) return { exit: ran.exit };
  if (ran.editorResult === 'applied') return { exit: ran.exit || 1, note: 'visudo: 構文を読めないので、保存していません' };
  return { exit: ran.exit || 1, note: 'エディタが開かれなかったので、編集は保存していません' };
}

function respond(ran: Ran, input: Input): AppResponse {
  const opened = ran.editorResult === 'opened';
  const save = input.edits ? saveExit(ran) : { exit: ran.exit };
  const stderr = [withoutLastNewline(opened ? ran.stderr.replace(EDITOR_UNCHANGED, '') : ran.stderr), ...(save.note ? [save.note] : [])].filter((part) => part !== '').join('\n');
  const result = { stdout: withoutLastNewline(ran.stdout.replace(VISUDO_PROMPT, '')), stderr, exit: save.exit, cwd: ran.cwd, changed: ran.changed.length > 0 };
  return json(200, opened ? { ...result, editor: openedFile(ran.editorDump) } : result);
}

/** 編集 1 件を、機械の中のエディタ（guest/editor）へ渡す 1 行にする（操作<TAB>行番号<TAB>内容。操作は r 書き換え・d 削除・a 下に追加） */
function editRow(edit: LineEdit): string {
  if ('after' in edit) return `a\t${edit.after}\t${edit.text}`;
  return 'text' in edit ? `r\t${edit.line}\t${edit.text}` : `d\t${edit.line}\t`;
}

/** コマンド行を機械の中で実行し、記録を観測イベントにする */
async function run(ctx: ServerContext, user: string, input: Input): Promise<Ran> {
  if (!ctx.machine) throw new Error('演習用の機械がありません');
  const edits = (input.edits ?? []).map((edit) => `${editRow(edit)}\n`).join('');
  // 本文は、1 行目が利用者、2 行目が場所、3 行目がコマンド行、4 行目以降が編集（guest/agent の run）
  const payload = `${[user, input.cwd, input.line].join('\n')}\n${edits}`;
  const [status = '', stdout = '', stderr = '', cwd = '', editorDump = '', editorResult = '', executions = '', sudoLog = '', changedPaths = ''] = await ctx.machine.call('run', payload, RUN_TIMEOUT_MS);
  const exit = Number(status);
  if (status === '' || !Number.isInteger(exit)) throw new Error(`機械から終了コードを受け取れません：${status}`);
  const changed = changedPaths.split('\n').filter((path) => path !== '');
  const emit: ServerContext['emit'] = (type, data) => {
    ctx.emit(type, data);
  };
  emitSudoDecisions(emit, sudoLog);
  emitExecutions(emit, executions);
  emitChanges(emit, changed, user);
  return { exit, stdout, stderr, cwd: cwd || input.cwd, editorDump, editorResult: editorResult as EditorResult, changed };
}

/** シェルに組み込みで、PATH には実行ファイルがないもののうち、この端末で使うもの（help は guest/run が差し替えた案内） */
const BUILTINS = ['cd', 'help'];
/** PATH にあるものの名前を並べるコマンド行（補完の候補に使う） */
const LIST_COMMANDS = 'IFS=:; for dir in $PATH; do ls "$dir" 2>/dev/null; done';

/** 利用者が名前だけで実行できるコマンドの名前（名前順）。機械の PATH にあるものを、機械に聞く。観測イベントにはしない */
async function commandNames(ctx: ServerContext, account: Account): Promise<string[]> {
  if (!ctx.machine) throw new Error('演習用の機械がありません');
  const [status = '', stdout = ''] = await ctx.machine.call('run', `${[account.name, account.home, LIST_COMMANDS].join('\n')}\n`, RUN_TIMEOUT_MS);
  if (status !== '0') throw new Error(`機械からコマンドの一覧を受け取れません（終了コード ${status}）`);
  const names = [...new Set([...BUILTINS, ...stdout.split('\n').filter((name) => name !== '')])];
  names.sort();
  return names;
}

export async function handle(ctx: ServerContext, req: AppRequest): Promise<AppResponse> {
  // 場所が実在するかどうかは機械が確かめる（なければ cd が失敗する）。ここでは形だけを確かめる
  const opened = terminalRequest(ctx, req, (cwd) => cwd.startsWith('/') && !/[\r\n]/.test(cwd));
  if ('response' in opened) return opened.response;
  const { account, input } = opened;
  if (!input) return sessionResponse(ctx, account, await commandNames(ctx, account));
  if (input.line.length > MAX_LINE_LENGTH) return json(200, { stdout: '', stderr: `sh: 入力が長すぎます（${MAX_LINE_LENGTH} 文字まで）`, exit: 2, cwd: input.cwd, changed: false });
  return respond(await run(ctx, account.name, input), input);
}
