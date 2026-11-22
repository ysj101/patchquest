// エディタでの編集（行の書き換え・削除・追加）を、開いたときの行番号で当てはめることと、形の検査を確かめる
import { describe, expect, it } from 'vitest';
import { applyEdits, effective, lastRow, parseEdits, type LineEdit } from '../../apps/shell/edits';

const LINES = ['一', '二', '三'];

describe('エディタでの編集', () => {
  it('書き換え・削除・追加を、並べた順によらず、開いたときの行番号で当てはめる', () => {
    const edits: LineEdit[] = [{ after: 3, text: '末尾' }, { line: 2, remove: true }, { after: 0, text: '先頭' }, { line: 3, text: '参' }, { after: 2, text: '二の下' }];
    expect(applyEdits(LINES, edits)).toEqual(['先頭', '一', '二の下', '参', '末尾']);
    expect(applyEdits(LINES, [...edits].reverse())).toEqual(['先頭', '一', '二の下', '参', '末尾']);
  });

  it('同じ行の下に足した行は、並べた順に入る', () => {
    expect(applyEdits(LINES, [{ after: 1, text: 'A' }, { after: 1, text: 'B' }])).toEqual(['一', 'A', 'B', '二', '三']);
  });

  it('すべての行を消すと空になり、空のファイルにも先頭へ足せる', () => {
    expect(applyEdits(LINES, [1, 2, 3].map((line) => ({ line, remove: true as const })))).toEqual([]);
    expect(applyEdits([], [{ after: 0, text: '初めの行' }])).toEqual(['初めの行']);
  });

  it('同じ内容への書き換えは、実際に変わる編集に数えない', () => {
    expect(effective(LINES, [{ line: 1, text: '一' }, { line: 2, text: 'に' }, { line: 3, remove: true }, { after: 0, text: '一' }])).toEqual([{ line: 2, text: 'に' }, { line: 3, remove: true }, { after: 0, text: '一' }]);
  });

  it('編集が指すいちばん大きい行番号を返す', () => {
    expect(lastRow([{ line: 2, text: 'x' }, { after: 5, text: 'y' }, { line: 4, remove: true }])).toBe(5);
  });

  it('編集が付いていなければ null、形の合うものはそのまま返す', () => {
    expect(parseEdits(undefined)).toEqual({ edits: null });
    const edits = [{ line: 1, text: 'x' }, { line: 2, remove: true }, { after: 0, text: '' }];
    expect(parseEdits(edits)).toEqual({ edits });
    expect(parseEdits(Array.from({ length: 101 }, (_, index) => ({ after: index, text: 'x' })))).toHaveProperty('error');
  });
});
