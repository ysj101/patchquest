// XP と実績の再計算結果を、表示用と保存用の形にまとめる。
import type { AttemptRecord } from '../contract';
import { achievementsFromAttempts, type AchievementOptions, type UnlockedAchievements } from './achievements';
import type { ProgressProfile } from './schema';
import { xpFromAttempts, type XpSummary } from './xp';

export interface ProfileSummary {
  xp: XpSummary;
  achievements: UnlockedAchievements;
}

export function profileFromAttempts(records: readonly AttemptRecord[], options: AchievementOptions): ProfileSummary {
  return { xp: xpFromAttempts(records), achievements: achievementsFromAttempts(records, options) };
}

export function storedProfile(summary: ProfileSummary): ProgressProfile {
  return { xp: { total: summary.xp.total }, achievements: summary.achievements };
}
