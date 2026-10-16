// 保存された演習記録から実績の解除日時と称号を導く。
import type { AttemptRecord, BadgeKind } from '../contract';
import { allBadgesAchieved } from './stages';

export const ACHIEVEMENTS = [
  { id: 'first-reproduction', name: '初めて再現', description: 'いずれかの演習で再現の達成印を得る' },
  { id: 'first-defense', name: '初めて防御', description: 'いずれかの演習で防御の達成印を得る' },
  { id: 'no-hint-defense', name: 'ヒントなしで防御', description: 'ヒントと解法を見ずに防御の達成印を得る' },
  { id: 'clean-repair', name: '正常な利用を壊さず防御', description: '初回の防御達成まで正常系を一度も壊さずに検証する（判定不能を除く）' },
  { id: 'first-try', name: '一度の検証で防御', description: '最初の検証で合格し、防御の達成印を得る' },
  { id: 'all-missions', name: 'すべての課題を解決', description: 'すべての課題で再現・防御・理解の達成印を揃える' },
] as const;

export type AchievementId = typeof ACHIEVEMENTS[number]['id'];
export type UnlockedAchievements = Partial<Record<AchievementId, string>>;
export interface AchievementOptions { missionIds: readonly string[] }

function compareAt(first: string, second: string): number {
  return (Date.parse(first) - Date.parse(second)) || first.localeCompare(second);
}

function badgeAt(attempt: AttemptRecord, kind: BadgeKind): string {
  if (kind === 'defense' && attempt.firstPass) return attempt.firstPass.at;
  return attempt.badges[kind].at ?? attempt.createdAt;
}

function latest(first: string, ...rest: string[]): string {
  return rest.reduce((previous, next) => compareAt(previous, next) > 0 ? previous : next, first);
}

function unlock(result: UnlockedAchievements, id: AchievementId, at: string): void {
  const previous = result[id];
  if (previous === undefined || compareAt(at, previous) < 0) result[id] = at;
}

function defenseAchievements(attempt: AttemptRecord, result: UnlockedAchievements): void {
  if (!attempt.badges.defense.achieved) return;
  const at = badgeAt(attempt, 'defense');
  unlock(result, 'first-defense', at);
  const first = attempt.firstPass;
  if (!first) return;
  if (!first.hintsUsed) unlock(result, 'no-hint-defense', at);
  if (!first.normalBroken) unlock(result, 'clean-repair', at);
  if (first.verifications === 1) unlock(result, 'first-try', at);
}

/** 初回合格の固定記録を使い、日時のない達成印は作成日時へ遡る。入力順によらず最初の解除を返す。 */
export function achievementsFromAttempts(attempts: readonly AttemptRecord[], { missionIds }: AchievementOptions): UnlockedAchievements {
  const result: UnlockedAchievements = {};
  const completed = new Map<string, string>();
  for (const attempt of attempts) {
    if (attempt.badges.reproduction.achieved) unlock(result, 'first-reproduction', badgeAt(attempt, 'reproduction'));
    defenseAchievements(attempt, result);
    if (!allBadgesAchieved(attempt)) continue;
    const at = latest(badgeAt(attempt, 'reproduction'), badgeAt(attempt, 'defense'), badgeAt(attempt, 'understanding'));
    const previous = completed.get(attempt.missionId);
    if (previous === undefined || compareAt(at, previous) < 0) completed.set(attempt.missionId, at);
  }
  const times = missionIds.flatMap((id) => completed.get(id) ?? []);
  const [first, ...rest] = times;
  if (first !== undefined && times.length === missionIds.length) result['all-missions'] = latest(first, ...rest);
  return result;
}

export function titleFor(unlocked: number): string {
  if (unlocked >= ACHIEVEMENTS.length) return '守り手';
  if (unlocked >= 4) return '修理担当';
  if (unlocked >= 2) return '調査員';
  return '新人';
}
