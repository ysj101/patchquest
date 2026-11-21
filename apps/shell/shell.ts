// 擬似シェルの共通の型と、コマンド行の分解。bash を動かすのではなく、固定のコマンド集合へ振り分けるための最小限だけを持つ
import type { ServerContext } from '../../runtimes/browser/app-module';
import type { Account } from './model';

/** 1 行に入力できる長さ（文字数） */
export const MAX_LINE_LENGTH = 1024;

/** エディタで書き換えた 1 行。line は 1 から数える行番号 */
export type LineEdit = { line: number; text: string };

/** エディタで開いたファイル（端末の画面が編集画面を出すのに使う） */
export type EditorFile = { path: string; lines: string[] };

export interface Output {
  stdout: string;
  stderr: string;
  /** 終了コード。0 が成功 */
  exit: number;
  /** カレントディレクトリを変えたときの移動先 */
  cwd?: string;
  /** 機械の状態（ファイルの内容）を変えたか */
  changed?: boolean;
  /** エディタを開くコマンドが、保存する内容を受け取らずに実行されたときの、開いたファイル */
  editor?: EditorFile;
}

export interface Env {
  ctx: ServerContext;
  /** ログインしている利用者 */
  user: Account;
  /** コマンドを実行する利用者。sudo を通すと root になる */
  as: Account;
  cwd: string;
  /** エディタで書き換えて保存する行。エディタを開くだけのときと、エディタを使わないコマンドでは null */
  edits: LineEdit[] | null;
}

export interface Command {
  /** 実行ファイルの場所。null はシェルに組み込みのコマンドで、sudo では実行できない */
  path: string | null;
  usage: string;
  summary: string;
  run(env: Env, args: string[]): Output;
}

export const ok = (stdout = ''): Output => ({ stdout, stderr: '', exit: 0 });
export const fail = (stderr: string, exit = 1): Output => ({ stdout: '', stderr, exit });

/** オプション（- で始まる引数）を受け取らないコマンドで、渡されたオプションを黙って無視しないための検査 */
export function rejectOptions(name: string, args: readonly string[]): Output | null {
  const option = args.find((arg) => arg.startsWith('-'));
  return option === undefined ? null : fail(`${name}: オプション ${option} には対応していません`, 2);
}

const UNSUPPORTED = '|&;<>$`\\*?';
const QUOTES = '"\'';

/** 1 文字を読んだ結果。end は語の区切り、add は語に足す文字、quote は続いている引用符 */
type Lexed = { end: boolean; add: string; quote: string | null } | { error: string };

/** 引用符の外の 1 文字。空白は語を区切り、対応していない記号は理由を返す */
function outsideQuote(char: string, startsWord: boolean): Lexed {
  if (char === ' ' || char === '\t') return { end: true, add: '', quote: null };
  if (UNSUPPORTED.includes(char)) return { error: `sh: 「${char}」には対応していません（パイプ・リダイレクト・変数・ワイルドカードは使えません）` };
  if (char === '#' && startsWord) return { error: "sh: # で始まる語は引用符で囲んでください（例：'# メモ'）" };
  return QUOTES.includes(char) ? { end: false, add: '', quote: char } : { end: false, add: char, quote: null };
}

/** 引用符の中の 1 文字。同じ引用符で閉じるまで、どの文字もそのまま語に足す */
function insideQuote(char: string, quote: string): Lexed {
  return char === quote ? { end: false, add: '', quote: null } : { end: false, add: char, quote };
}

/**
 * コマンド行を語に分ける。空白で区切り、引用符（' と "）の中は 1 語にまとめる。
 * パイプ・リダイレクト・変数展開・ワイルドカードには対応せず、使われたら理由を返す（黙って無視しない）
 */
export function tokenize(line: string): { words: string[] } | { error: string } {
  const words: string[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  for (const char of line) {
    const lexed: Lexed = quote === null ? outsideQuote(char, word === null) : insideQuote(char, quote);
    if ('error' in lexed) return lexed;
    if (lexed.end && word !== null) words.push(word);
    word = lexed.end ? null : (word ?? '') + lexed.add;
    quote = lexed.quote;
  }
  if (quote !== null) return { error: 'sh: 引用符が閉じていません' };
  if (word !== null) words.push(word);
  return { words };
}
