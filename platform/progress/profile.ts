// XP・実績・習熟度の再計算結果を、表示用と保存用の形にまとめる。
import type { AttemptRecord } from '../contract';
import { achievementsFromAttempts, type AchievementOptions, type UnlockedAchievements } from './achievements';
import { masteryFromAttempts, type MasterySummary, type MissionCategories } from './mastery';
import type { ProgressProfile } from './schema';
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
}

export function profileFromAttempts(records: readonly AttemptRecord[], options: ProfileOptions): ProfileSummary {
  return { xp: xpFromAttempts(records), achievements: achievementsFromAttempts(records, options), mastery: masteryFromAttempts(records, options.categories) };
}

export function storedProfile(summary: ProfileSummary): ProgressProfile {
  return { xp: { total: summary.xp.total }, achievements: summary.achievements };
}
