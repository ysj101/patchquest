// XP と実績の再計算結果に、記録から導けない復習の回答と週間目標を合わせ、表示用と保存用の形にまとめる。
import type { AttemptRecord } from '../contract';
import { achievementsFromAttempts, type AchievementOptions, type UnlockedAchievements } from './achievements';
import type { ReviewEntry } from './review';
import type { ProgressProfile } from './schema';
import type { WeeklyGoalId } from './weekly-goal';
import { xpFromAttempts, type XpSummary } from './xp';

export interface ProfileSummary {
  xp: XpSummary;
  achievements: UnlockedAchievements;
  /** 復習の回答（古い順） */
  reviews: ReviewEntry[];
  weeklyGoal: WeeklyGoalId | null;
}

/** 保存値のうち、Attempt から再計算できない項目 */
export type KeptProfile = Pick<ProgressProfile, 'reviews' | 'weeklyGoal'>;

export function profileFromAttempts(records: readonly AttemptRecord[], options: AchievementOptions, kept: KeptProfile = {}): ProfileSummary {
  const reviews = kept.reviews ?? [];
  return { xp: xpFromAttempts(records, reviews), achievements: achievementsFromAttempts(records, options), reviews, weeklyGoal: kept.weeklyGoal ?? null };
}

export function storedProfile(summary: ProfileSummary): ProgressProfile {
  return {
    xp: { total: summary.xp.total },
    achievements: summary.achievements,
    ...(summary.reviews.length > 0 && { reviews: summary.reviews }),
    ...(summary.weeklyGoal !== null && { weeklyGoal: summary.weeklyGoal }),
  };
}
