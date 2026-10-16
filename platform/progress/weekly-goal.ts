// 任意の週間目標。端末のローカル時刻で月曜始まりの週を区切り、演習の完了と復習の回答を 1 日 1 回として数える。
// 未達で減点・喪失・警告はしない（spec §9）
import type { AttemptRecord } from '../contract';
import type { ReviewEntry } from './review';
import { achievedAt, allBadgesAchieved } from './stages';

export const WEEKLY_GOALS = [
  { id: 'once', label: '週 1 回', min: 1 },
  { id: 'few', label: '週 2〜3 回', min: 2 },
] as const;
export type WeeklyGoalId = (typeof WEEKLY_GOALS)[number]['id'];
export const WEEKLY_GOAL_IDS = WEEKLY_GOALS.map((goal) => goal.id) as readonly WeeklyGoalId[];

const DAY_MS = 24 * 60 * 60 * 1000;

/** ローカル時刻の日付キー（同じ日の取り組みを 1 回にまとめる） */
export function localDayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

/** その時点を含む週の始まり（ローカル時刻の月曜 0 時） */
export function weekStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** 演習を完了した時刻（3 つの達成印のうち最後に押した時刻）。完了していなければ null */
export function completedAt(attempt: AttemptRecord): string | null {
  return allBadgesAchieved(attempt) ? achievedAt(attempt) : null;
}

export interface WeeklyActivity {
  weekStart: Date;
  /** 今週に取り組んだ日数（1 日 1 回） */
  count: number;
  goal: (typeof WEEKLY_GOALS)[number] | null;
  /** 目標があり、回数が届いたか */
  reached: boolean;
}

/** 今週の取り組み（演習の完了と復習の回答）を日ごとに 1 回として数え、選んだ目標と比べる */
export function weeklyActivity(attempts: readonly AttemptRecord[], reviews: readonly ReviewEntry[], goalId: WeeklyGoalId | null, now: Date): WeeklyActivity {
  const start = weekStart(now);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const times = [...attempts.flatMap((attempt) => completedAt(attempt) ?? []), ...reviews.map((review) => review.at)];
  const days = new Set<string>();
  for (const time of times) {
    const at = new Date(time);
    if (Number.isNaN(at.getTime()) || at < start || at >= end) continue;
    days.add(localDayKey(at));
  }
  const goal = WEEKLY_GOALS.find((candidate) => candidate.id === goalId) ?? null;
  return { weekStart: start, count: days.size, goal, reached: goal !== null && days.size >= goal.min };
}
