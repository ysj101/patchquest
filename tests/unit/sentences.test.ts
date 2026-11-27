import { describe, expect, it } from 'vitest';
import { splitSentences } from '../../platform/contract';

describe('splitSentences', () => {
  it('句点の直後で区切り、つなげると元の文字列に戻る', () => {
    const text = '検索語を値として渡します。持ち主の条件も残します。';
    expect(splitSentences(text)).toEqual(['検索語を値として渡します。', '持ち主の条件も残します。']);
    expect(splitSentences(text).join('')).toBe(text);
  });

  it('句点で終わらない残りも、最後の文として返す', () => {
    expect(splitSentences('不正解。ほかの答えも考えてみましょう')).toEqual(['不正解。', 'ほかの答えも考えてみましょう']);
  });

  it('句点のない文は、そのまま 1 つで返す', () => {
    expect(splitSentences('対策を選ぶ')).toEqual(['対策を選ぶ']);
  });

  it('空の文字列は、文なしとして返す', () => {
    expect(splitSentences('')).toEqual([]);
  });

  it('丸かっこの中の句点では区切らない', () => {
    expect(splitSentences('値として渡します（バインド。別名はプレースホルダ）。条件も残します。')).toEqual(['値として渡します（バインド。別名はプレースホルダ）。', '条件も残します。']);
  });

  it('かぎかっこの中の文は区切り、閉じかっこの直前の句点では区切らない', () => {
    expect(splitSentences('「メモが出てきました。ほかの人のメモも混ざります。」と届きました。調べます。')).toEqual([
      '「メモが出てきました。',
      'ほかの人のメモも混ざります。」と届きました。',
      '調べます。',
    ]);
    expect(splitSentences('『読む。』を開きます。')).toEqual(['『読む。』を開きます。']);
  });

  it('開いていない閉じかっこがあっても、その後ろの句点で区切る', () => {
    expect(splitSentences('1）調べる。2）直す。')).toEqual(['1）調べる。', '2）直す。']);
  });
});
