// 端末の入力欄での、コマンド名の補完（Tab キー）。カーソルの手前の語が、コマンドを書く位置にあるときだけ補う。
// ファイル名は補わない（機械へ問い合わせる必要があり、問い合わせは 1 回ごとに観測ログへ残るため）
export interface Completion {
  /** 補ったあとのコマンド行 */
  line: string;
  /** 補ったあとのカーソルの位置 */
  cursor: number;
  /** 候補が複数あって、これ以上補えないときの候補の一覧（端末に並べて見せる）。補えたとき・候補がないときは空 */
  listed: string[];
}

/** コマンドを区切る記号（パイプ・続けて実行）。この直後の語はコマンド名 */
const SEPARATORS = '|;&';
/** 語の切れ目（空白と、コマンドを区切る記号） */
const isBreak = (char: string): boolean => /\s/.test(char) || SEPARATORS.includes(char);

/** カーソルの手前（head）で打ちかけている語が始まる位置 */
function wordStart(head: string): number {
  let start = head.length;
  while (start > 0 && !isBreak(head.charAt(start - 1))) start -= 1;
  return start;
}
/** 語の手前が sudo で終わっている（sudo に続く語はコマンド名） */
const AFTER_SUDO = /(?:^|[\s|;&])sudo$/;

/** 語の手前（before）から見て、次の語がコマンド名になる位置か。行の先頭・区切りの記号の直後・sudo の直後 */
function isCommandPosition(before: string): boolean {
  const trimmed = before.trimEnd();
  return trimmed === '' || SEPARATORS.includes(trimmed.slice(-1)) || (trimmed !== before && AFTER_SUDO.test(trimmed));
}

/** どの候補にも共通する先頭の部分 */
function commonPrefix(words: readonly string[]): string {
  let prefix = words[0] ?? '';
  for (const word of words) {
    while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/**
 * カーソルの手前の語を、コマンド名（commands）で補う。候補が 1 つならその名前と空白 1 つ、複数なら共通する部分まで補う。
 * コマンド名を書く位置でないとき・語が空のとき・パス（/ を含む）のときは、補完の対象ではないので null を返す
 */
export function complete(line: string, cursor: number, commands: readonly string[]): Completion | null {
  const head = line.slice(0, cursor);
  const tail = line.slice(cursor);
  const before = head.slice(0, wordStart(head));
  const word = head.slice(before.length);
  if (word === '' || word.includes('/') || !isCommandPosition(before)) return null;
  const candidates = [...new Set(commands.filter((name) => name.startsWith(word)))];
  candidates.sort();
  if (candidates.length === 0) return { line, cursor, listed: [] };
  let filled = commonPrefix(candidates);
  // 候補が 1 つに決まったら、続けて引数を打てるよう空白を足す（すでに空白が続いていれば足さない）
  if (candidates.length === 1 && !/^\s/.test(tail)) filled += ' ';
  return { line: `${before}${filled}${tail}`, cursor: before.length + filled.length, listed: filled === word ? candidates : [] };
}
