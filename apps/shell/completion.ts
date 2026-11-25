// 端末の入力欄での補完（Tab キー）。カーソルの手前の語が、コマンドを書く位置にあればコマンド名で、それ以外の位置やパスならファイル名で補う。
// コマンド名は端末を開いたときに受け取ったもので補う。ファイル名は、その場所にある名前を機械へ尋ねて補う（尋ねるのは画面の役目。view.ts）
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

/** カーソルの手前で打ちかけている語（word）と、その前後 */
interface Word {
  before: string;
  word: string;
  tail: string;
}

function wordAt(line: string, cursor: number): Word {
  const head = line.slice(0, cursor);
  const before = head.slice(0, wordStart(head));
  return { before, word: head.slice(before.length), tail: line.slice(cursor) };
}

/**
 * 語のうち typed の部分を、names のうち typed で始まるもので補う（kept は、語のうち補わずに残す先頭の部分）。
 * 候補が 1 つならその名前まで、複数なら共通する部分まで補う
 */
function fill(at: Word, kept: string, typed: string, names: readonly string[]): Completion {
  const candidates = [...new Set(names.filter((name) => name.startsWith(typed)))];
  candidates.sort();
  if (candidates.length === 0) return { line: `${at.before}${at.word}${at.tail}`, cursor: at.before.length + at.word.length, listed: [] };
  let filled = commonPrefix(candidates);
  // 候補が 1 つに決まったら、続けて引数を打てるよう空白を足す（すでに空白が続いていれば足さない）。ディレクトリは、続けて中の名前を打てるよう足さない
  if (candidates.length === 1 && !filled.endsWith('/') && !/^\s/.test(at.tail)) filled += ' ';
  const done = `${at.before}${kept}${filled}`;
  return { line: `${done}${at.tail}`, cursor: done.length, listed: filled === typed ? candidates : [] };
}

/**
 * カーソルの手前の語を、コマンド名（commands）で補う。候補が 1 つならその名前と空白 1 つ、複数なら共通する部分まで補う。
 * コマンド名を書く位置でないとき・語が空のとき・パス（/ を含む）のときは、コマンド名の補完の対象ではないので null を返す
 */
export function complete(line: string, cursor: number, commands: readonly string[]): Completion | null {
  const at = wordAt(line, cursor);
  if (at.word === '' || at.word.includes('/') || !isCommandPosition(at.before)) return null;
  return fill(at, '', at.word, commands);
}

/** そのまま打つと、シェルが名前の一部として読まない文字（空白・引用符・展開や区切りの記号）。これを含む語と名前は、ファイル名の補完の対象にしない */
const NEEDS_QUOTING = /[\s'"\\$`*?!&|;<>()[\]{}~#]/;

/** 語のうち、場所の部分（最後の / まで）の長さ */
const placeLength = (word: string): number => word.lastIndexOf('/') + 1;

/** 語がファイル名として補える位置にあるか。オプション（- で始まる語）と、コマンド名として補う語（complete の対象）と、行の先頭の空の語は補わない */
function isNameWord(at: Word): boolean {
  if (at.word.startsWith('-') || NEEDS_QUOTING.test(at.word)) return false;
  return at.word.includes('/') || !isCommandPosition(at.before);
}

/**
 * カーソルの手前の語をファイル名として補うときに、名前を調べるディレクトリ（絶対パス。.. は畳まない）。
 * 語に / があればそこまでの場所、なければいまの場所（cwd）。ファイル名の補完の対象でなければ null
 */
export function nameDir(line: string, cursor: number, cwd: string): string | null {
  const at = wordAt(line, cursor);
  if (!isNameWord(at)) return null;
  const place = at.word.slice(0, placeLength(at.word));
  if (place === '') return cwd;
  return place.startsWith('/') ? place : `${cwd}/${place}`;
}

/**
 * カーソルの手前の語を、nameDir が返した場所にある名前（names。ディレクトリは末尾に / を付けたもの）で補う。
 * . で始まる名前は、語の名前の部分が . で始まるときだけ候補にする（本物のシェルと同じ）
 */
export function completeName(line: string, cursor: number, names: readonly string[]): Completion {
  const at = wordAt(line, cursor);
  const place = at.word.slice(0, placeLength(at.word));
  const typed = at.word.slice(place.length);
  const usable = names.filter((name) => !NEEDS_QUOTING.test(name) && (typed.startsWith('.') || !name.startsWith('.')));
  return fill(at, place, typed, usable);
}
