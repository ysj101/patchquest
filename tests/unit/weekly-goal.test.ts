// 同じ日の取り組みを 1 回にまとめる日付キーが、ローカル時刻の年月日になることを確かめる。
import { expect, it } from 'vitest';
import { localDayKey } from '../../platform/progress/weekly-goal';

it('日付キーはローカル時刻の年月日', () => {
  expect(localDayKey(new Date(2026, 9, 12, 0, 0))).toBe('2026-10-12');
  expect(localDayKey(new Date(2026, 9, 12, 23, 59))).toBe('2026-10-12');
});
