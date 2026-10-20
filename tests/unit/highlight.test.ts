import { describe, expect, it } from 'vitest';
import { highlightSource, type CodeToken, type MarkedKind } from '../../platform/syntax/highlight';

function text(tokens: readonly CodeToken[]): string {
  return tokens.map((token) => token.text).join('');
}

function kinds(tokens: readonly CodeToken[], kind: MarkedKind | 'text'): string[] {
  return tokens.filter((token) => token.kind === kind).map((token) => token.text);
}

describe('highlightSource', () => {
  it('印を連結すると、どの言語でも元のソースに戻る', () => {
    const samples = [
      ['ts', "const pattern = `%${term}%`; // 注\nreturn 'a\\'b';"],
      ['sql', "SELECT id FROM memos WHERE name = 'O''Brien' -- 注\n/* 未閉"],
      ['html', '<p class="name"><!-- 注 --><span>本文</span></p>'],
    ] as const;
    for (const [language, source] of samples) expect(text(highlightSource(language, source))).toBe(source);
  });

  it('TypeScript のキーワード・文字列・行コメントを分ける', () => {
    const source = "const answer = 'ok'; // 表示だけ変更\nreturn answer;";
    const tokens = highlightSource('ts', source);
    expect(kinds(tokens, 'keyword')).toEqual(['const', 'return']);
    expect(kinds(tokens, 'string')).toEqual(["'ok'"]);
    expect(kinds(tokens, 'comment')).toEqual(['// 表示だけ変更']);
  });

  it('文字列の中の // と、正規表現リテラルの中はコメントやキーワードにしない', () => {
    const source = 'const url = "http://example"; if (/union/i.test(term)) return term;';
    const tokens = highlightSource('ts', source);
    expect(kinds(tokens, 'keyword')).toEqual(['const', 'if', 'return']);
    expect(kinds(tokens, 'comment')).toEqual([]);
    expect(kinds(tokens, 'string')).toEqual(['"http://example"']);
    expect(text(tokens)).toContain('/union/i');
  });

  it('テンプレートの ${} の中だけをコードとして分ける', () => {
    const source = 'const pattern = `%${term}%`;';
    const tokens = highlightSource('ts', source);
    expect(kinds(tokens, 'keyword')).toEqual(['const']);
    expect(kinds(tokens, 'string').join('')).toBe('`%${}%`');
    expect(kinds(tokens, 'text')).toContain('term');
    expect(text(tokens)).toBe(source);
    expect(text(highlightSource('ts', 'const broken = `${term`;'))).toBe('const broken = `${term`;');
    expect(text(highlightSource('ts', 'const nested = `${a{b}}`;'))).toBe('const nested = `${a{b}}`;');
  });

  it('ブロックコメントは閉じるまでコメントのままにする', () => {
    const source = 'return 1; /* // これはコメント */ const left = 1;';
    const tokens = highlightSource('ts', source);
    expect(kinds(tokens, 'comment')).toEqual(['/* // これはコメント */']);
    expect(kinds(tokens, 'keyword')).toEqual(['return', 'const']);
  });

  it('SQL は大文字小文字を問わずキーワードを分け、-- と引用符の繰り返しを守る', () => {
    const source = "select id from memos where name = 'O''Brien' -- 残り\nAND 1 = 1";
    const tokens = highlightSource('sql', source);
    expect(kinds(tokens, 'keyword')).toEqual(['select', 'from', 'where', 'AND']);
    expect(kinds(tokens, 'string')).toEqual(["'O''Brien'"]);
    expect(kinds(tokens, 'comment')).toEqual(['-- 残り']);
  });

  it('HTML はタグ名をキーワード、属性値を文字列、コメントをコメントにする', () => {
    const source = '<p class="name"><!-- 注 --></p>';
    const tokens = highlightSource('html', source);
    expect(kinds(tokens, 'keyword')).toEqual(['p', 'p']);
    expect(kinds(tokens, 'string')).toEqual(['"name"']);
    expect(kinds(tokens, 'comment')).toEqual(['<!-- 注 -->']);
    expect(text(tokens)).toBe(source);
  });

  it('空のソースは印を返さない', () => {
    expect(highlightSource('ts', '')).toEqual([]);
  });
});
