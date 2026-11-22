// エディタ（visudo の編集画面）での編集の形と、その検査・当てはめ。行の書き換え・削除・追加を、開いたときの行番号で表す。
// 行番号が開いたときのものなので、編集どうしは互いに影響せず、保存のやり取り 1 回だけを再生しても同じ結果になる
import { MAX_LINE_LENGTH } from './shell';

/**
 * エディタでの編集 1 件。行番号は、開いたときのファイルの行番号（1 から）。
 * - { line, text }：その行を書き換える
 * - { line, remove: true }：その行を消す
 * - { after, text }：その行の下に 1 行足す（after: 0 は先頭）。同じ行の下に複数足すと、並べた順に入る
 */
export type LineEdit = { line: number; text: string } | { line: number; remove: true } | { after: number; text: string };

/** 1 回の保存で送れる編集の数 */
const MAX_EDITS = 100;

const isRow = (value: unknown, least: number): boolean => Number.isInteger(value) && Number(value) >= least;
const isText = (value: unknown): boolean => typeof value === 'string' && value.length <= MAX_LINE_LENGTH && !/[\r\n]/.test(value);

function isLineEdit(value: unknown): value is LineEdit {
  if (typeof value !== 'object' || value === null) return false;
  const { line, after, text, remove } = value as { line?: unknown; after?: unknown; text?: unknown; remove?: unknown };
  if (after !== undefined) return line === undefined && remove === undefined && isRow(after, 0) && isText(text);
  if (remove !== undefined) return remove === true && text === undefined && isRow(line, 1);
  return isRow(line, 1) && isText(text);
}

/** 要求に付いた編集（edits）を読む。付いていなければ edits は null。形が違えば理由を返す */
export function parseEdits(edits: unknown): { edits: LineEdit[] | null } | { error: string } {
  if (edits === undefined) return { edits: null };
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > MAX_EDITS || !edits.every(isLineEdit)) {
    return { error: 'edits には、{ "line": 行番号, "text": "1 行の内容" }（書き換え）・{ "line": 行番号, "remove": true }（削除）・{ "after": 行番号, "text": "1 行の内容" }（追加）を 1 件以上入れてください' };
  }
  const touched = edits.flatMap((edit) => ('line' in edit ? [edit.line] : []));
  if (new Set(touched).size !== touched.length) return { error: 'edits に、同じ行番号を 2 回入れることはできません' };
  return { edits };
}

/** 編集が指す行番号のうち、いちばん大きいもの */
export const lastRow = (edits: readonly LineEdit[]): number => Math.max(...edits.map((edit) => ('line' in edit ? edit.line : edit.after)));

/** 編集を当てはめたあとの行。行番号が範囲の中にあることは、呼び出し側が先に確かめる */
export function applyEdits(lines: readonly string[], edits: readonly LineEdit[]): string[] {
  const added = (row: number): string[] => edits.flatMap((edit) => ('after' in edit && edit.after === row ? [edit.text] : []));
  const kept = (text: string, row: number): string[] => {
    const edit = edits.find((candidate) => 'line' in candidate && candidate.line === row);
    if (!edit) return [text];
    return 'text' in edit ? [edit.text] : [];
  };
  return [...added(0), ...lines.flatMap((text, index) => [...kept(text, index + 1), ...added(index + 1)])];
}

/** 実際に変わる編集だけを残す（同じ内容への書き換えを除く） */
export const effective = (lines: readonly string[], edits: readonly LineEdit[]): LineEdit[] => edits.filter((edit) => !('line' in edit && 'text' in edit && lines[edit.line - 1] === edit.text));
