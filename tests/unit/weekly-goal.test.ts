// 週間目標の判定（ローカル時刻の月曜始まり、1 日 1 回、演習の完了と復習の回答）を確かめる。
import { describe, expect, it } from 'vitest';
import type { ReviewEntry } from '../../platform/progress/review';
import { WEEKLY_GOALS, completedAt, localDayKey, weekStart, weeklyActivity } from '../../platform/progress/weekly-goal';
import { makeAttempt } from '../support/attempt';

/** ローカル時刻の日時（2026 年 10 月 12 日は月曜） */
const local = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute);
const iso = (day: number, hour = 12) => local(day, hour).toISOString();
const review = (day: number, hour = 12): ReviewEntry => ({ at: iso(day, hour), missionId: 'test-pack', questionId: 'q1', correct: true });
const complete = (id: string, at: string) => makeAttempt(id, {
  badges: { reproduction: { achieved: true, at }, defense: { achieved: true, at }, understanding: { achieved: true, at } },
});

describe('weekStart', () => {
  it('月曜 0 時から日曜 23:59 までを同じ週にし、月曜 0 時はその週の始まり', () => {
    const monday = local(12, 0, 0);
    expect(weekStart(local(12, 0, 0)).getTime()).toBe(monday.getTime());
    expect(weekStart(local(15, 8)).getTime()).toBe(monday.getTime());
    expect(weekStart(local(18, 23, 59)).getTime()).toBe(monday.getTime());
    expect(weekStart(local(19, 0, 0)).getTime()).toBe(local(19, 0, 0).getTime());
    expect(weekStart(local(11, 23, 59)).getTime()).toBe(local(5, 0, 0).getTime());
  });
});

describe('weeklyActivity', () => {
  it('目標がなく取り組みもなければ 0 回で、届いた判定はしない', () => {
    expect(weeklyActivity([], [], null, local(14))).toMatchObject({ count: 0, goal: null, reached: false });
  });

  it('今週の復習と演習の完了を数え、先週と来週は数えない', () => {
    const attempts = [complete('先週', iso(11, 23)), complete('今週', iso(13)), complete('来週', iso(19, 0))];
    const reviews = [review(12, 9), review(18, 23)];
    const activity = weeklyActivity(attempts, reviews, 'few', local(15));
    expect(activity.count).toBe(3);
    expect(activity.weekStart.getTime()).toBe(local(12, 0, 0).getTime());
  });

  it('同じ日に何回取り組んでも 1 回と数える', () => {
    const reviews = [review(13, 8), review(13, 12), review(13, 20)];
    expect(weeklyActivity([complete('同日', iso(13, 15))], reviews, 'once', local(14)).count).toBe(1);
  });

  it('週 1 回は 1 日で、週 2〜3 回は 2 日で届く', () => {
    const once = WEEKLY_GOALS.find((goal) => goal.id === 'once');
    const few = WEEKLY_GOALS.find((goal) => goal.id === 'few');
    expect(weeklyActivity([], [review(12)], 'once', local(14))).toMatchObject({ goal: once, reached: true });
    expect(weeklyActivity([], [review(12)], 'few', local(14))).toMatchObject({ goal: few, reached: false });
    expect(weeklyActivity([], [review(12), review(14)], 'few', local(14)).reached).toBe(true);
  });

  it('3 印そろっていない演習と、読めない日時は数えない', () => {
    const half = makeAttempt('途中', { badges: { reproduction: { achieved: true, at: iso(13) }, defense: { achieved: false }, understanding: { achieved: false } } });
    const broken: ReviewEntry = { at: 'いつか', missionId: 'test-pack', questionId: 'q1', correct: true };
    expect(weeklyActivity([half], [broken], 'once', local(14)).count).toBe(0);
    expect(completedAt(half)).toBeNull();
  });

  it('演習の完了時刻は最後に押した達成印の時刻で、時刻のない達成印は作成日時に遡る', () => {
    const attempt = makeAttempt('完了', {
      createdAt: iso(12, 9),
      badges: { reproduction: { achieved: true, at: iso(12, 10) }, defense: { achieved: true }, understanding: { achieved: true, at: iso(13, 11) } },
    });
    expect(completedAt(attempt)).toBe(iso(13, 11));
    const noTimes = makeAttempt('時刻なし', { createdAt: iso(12, 9), badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } } });
    expect(completedAt(noTimes)).toBe(iso(12, 9));
  });

  it('日付キーはローカル時刻の年月日', () => {
    expect(localDayKey(local(12, 0, 0))).toBe('2026-10-12');
    expect(localDayKey(local(12, 23, 59))).toBe('2026-10-12');
  });
});
