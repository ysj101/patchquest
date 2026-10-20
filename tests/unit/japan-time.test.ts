// 記録に出す日時が、日本時間の「10月21日 6:05」になることを確かめる。
import { expect, it } from 'vitest';
import { japanDateLabel } from '../../platform/ui/japan-time';

it('協定世界時の夜を、翌日の日本時間にする', () => {
  expect(japanDateLabel('2026-10-20T21:05:00.000Z')).toBe('10月21日 6:05');
});

it('朝・0 時・1 桁の月を、先頭の 0 なしで日本時間にする', () => {
  expect(japanDateLabel('2026-10-12T00:00:00Z')).toBe('10月12日 9:00');
  expect(japanDateLabel('2026-10-20T15:00:00.000Z')).toBe('10月21日 0:00');
  expect(japanDateLabel('2026-01-01T00:05:00.000Z')).toBe('1月1日 9:05');
});

it('解釈できない文字列は日時不明にし、ISO や Z を出さない', () => {
  expect(japanDateLabel('未定')).toBe('日時不明');
  expect(japanDateLabel('')).toBe('日時不明');
  expect(japanDateLabel('2026-10-20TZ')).toBe('日時不明');
});
