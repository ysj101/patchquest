// XP・実績・習熟度の再計算結果に、記録から導けない復習の回答と週間目標を合わせ、表示用と保存用の形にまとめる。
import type { AttemptRecord } from '../contract';
import { achievementsFromAttempts, type AchievementOptions, type UnlockedAchievements } from './achievements';
import { masteryFromAttempts, type MasterySummary, type MissionCategories } from './mastery';
import type { ReviewEntry } from './review';
import type { ProgressProfile } from './schema';
import type { WeeklyGoalId } from './weekly-goal';
import { xpFromAttempts, type XpSummary } from './xp';

export interface ProfileOptions extends AchievementOptions {
  /** 課題 ID → 脆弱性の分類。習熟度の集計に使う */
  categories: MissionCategories;
}

export interface ProfileSummary {
  xp: XpSummary;
  achievements: UnlockedAchievements;
  /** 分類ごとの習熟度。記録から都度計算し、進捗ファイルには保存しない */
  mastery: MasterySummary;
  /** 復習の回答（古い順） */
  reviews: ReviewEntry[];
  weeklyGoal: WeeklyGoalId | null;
}

/** 保存値のうち、Attempt から再計算できない項目 */
export type KeptProfile = Pick<ProgressProfile, 'reviews' | 'weeklyGoal'>;

export function profileFromAttempts(records: readonly AttemptRecord[], options: ProfileOptions, kept: KeptProfile = {}): ProfileSummary {
  const reviews = kept.reviews ?? [];
  return {
    xp: xpFromAttempts(records, reviews),
    achievements: achievementsFromAttempts(records, options),
    mastery: masteryFromAttempts(records, options.categories, reviews),
    reviews,
    weeklyGoal: kept.weeklyGoal ?? null,
  };
}

export function storedProfile(summary: ProfileSummary): ProgressProfile {
  return {
    xp: { total: summary.xp.total },
    achievements: summary.achievements,
    ...(summary.reviews.length > 0 && { reviews: summary.reviews }),
    ...(summary.weeklyGoal !== null && { weeklyGoal: summary.weeklyGoal }),
  };
}
