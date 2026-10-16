// 演習記録から課題ごとの到達報酬と再挑戦報酬を再計算する。
import type { AttemptRecord } from '../contract';
import { reviewXp, type ReviewEntry } from './review';
import { allBadgesAchieved, stageStates } from './stages';

export const STAGE_XP = [10, 20, 30, 30, 50] as const;
export const RETRY_XP = 20;
export const MAX_RETRY_BONUSES = 3;
export const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700] as const;

export interface XpSummary {
  total: number;
  level: number;
  nextLevelAt: number | null;
  byMission: Record<string, { stages: number; retries: number }>;
  /** 復習の正答（1 日 1 回）の分 */
  review: number;
}

/** XP は到達した事実への報酬。防御の現在性によらず記録を使い、対策を取り消しても減らさない。復習の正答は少量を足す。 */
export function xpFromAttempts(attempts: readonly AttemptRecord[], reviews: readonly ReviewEntry[] = []): XpSummary {
  const missions = new Map<string, { stages: Set<number>; completed: Set<string>; retries: number }>();
  for (const attempt of [...attempts].sort((first, second) => first.createdAt.localeCompare(second.createdAt))) {
    let mission = missions.get(attempt.missionId);
    if (!mission) {
      mission = { stages: new Set(), completed: new Set(), retries: 0 };
      missions.set(attempt.missionId, mission);
    }
    stageStates(attempt, true).forEach((stage, index) => {
      if (stage.state === 'done') mission.stages.add(index);
    });
    if (!allBadgesAchieved(attempt)) continue;
    const key = `${attempt.variantId}\u0000${attempt.seed}`;
    if (mission.completed.size && !mission.completed.has(key) && mission.retries < MAX_RETRY_BONUSES) mission.retries++;
    mission.completed.add(key);
  }
  const byMission = Object.fromEntries([...missions].map(([id, mission]) => [id, {
    stages: STAGE_XP.reduce((total, reward, index) => total + (mission.stages.has(index) ? reward : 0), 0),
    retries: mission.retries * RETRY_XP,
  }]));
  const review = reviewXp(reviews);
  const total = Object.values(byMission).reduce((sum, mission) => sum + mission.stages + mission.retries, review);
  const level = LEVEL_THRESHOLDS.filter((threshold) => total >= threshold).length;
  return { total, level, nextLevelAt: LEVEL_THRESHOLDS[level] ?? null, byMission, review };
}
