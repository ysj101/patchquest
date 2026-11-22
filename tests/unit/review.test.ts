// 復習の正答から導く少量の XP が、繰り返しで増え続けないことを確かめる。
import { describe, expect, it } from 'vitest';
import { REVIEW_XP, reviewXp, type ReviewEntry } from '../../platform/progress/review';
import { xpFromAttempts } from '../../platform/progress/xp';
import { makeAttempt } from '../support/attempt';

/** ローカル時刻の日時を ISO 文字列にする（日の境目の判定が端末のタイムゾーンに依らないようにする） */
const local = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour).toISOString();

describe('reviewXp', () => {
  const entry = (at: string, correct = true, questionId = 'q1'): ReviewEntry => ({ at, missionId: 'done', questionId, correct });

  it(`正解 1 回に ${REVIEW_XP} XP を与え、不正解には与えない`, () => {
    expect(reviewXp([])).toBe(0);
    expect(reviewXp([entry(local(2026, 10, 12))])).toBe(REVIEW_XP);
    expect(reviewXp([entry(local(2026, 10, 12), false)])).toBe(0);
  });

  it('同じ日の 2 回目以降の正解には与えず、別の日なら与える（繰り返しで増え続けない）', () => {
    const sameDay = [entry(local(2026, 10, 12, 9)), entry(local(2026, 10, 12, 18), true, 'q2'), entry(local(2026, 10, 12, 23), true, 'q3')];
    expect(reviewXp(sameDay)).toBe(REVIEW_XP);
    expect(reviewXp([...sameDay, entry(local(2026, 10, 13))])).toBe(REVIEW_XP * 2);
  });

  it('日時が読めない回答は数えない', () => {
    expect(reviewXp([entry('いつか')])).toBe(0);
  });

  it('演習の XP に復習の分を足し、内訳を review に示す', () => {
    const reviews = [entry(local(2026, 10, 12)), entry(local(2026, 10, 13))];
    const summary = xpFromAttempts([makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } })], reviews);
    expect(summary).toMatchObject({ total: 10 + REVIEW_XP * 2, review: REVIEW_XP * 2 });
  });
});
