// 脆弱性の分類ごとの習熟度（★0〜5）を、保存済みの演習記録から都度計算する。XP（取り組みへの報酬）とは分け、保存しない（spec §9, §13）
import type { AttemptRecord, VulnerabilityCategory } from '../contract';
import { VULNERABILITY_CATEGORIES } from '../contract';
import { allBadgesAchieved } from './stages';

export const MASTERY_MAX = 5;

/** 課題 ID → その課題が扱う脆弱性の分類。カタログのマニフェストから作る（tutorial は含めない） */
export type MissionCategories = Readonly<Record<string, VulnerabilityCategory>>;

/** ★の段階。同じ分類の課題の達成印と、別条件（別の seed・variant・課題）での全達成の回数で決まる */
export const MASTERY_STEPS = [
  { stars: 1, reason: '再現の達成印' },
  { stars: 2, reason: '防御の達成印' },
  { stars: 3, reason: '再現・防御・理解がそろった' },
  { stars: 4, reason: '別の条件（seed）でもう一度そろえた' },
  { stars: 5, reason: '別の条件で 3 回目をそろえた' },
] as const;

/** ★を上げた演習。どの達成がどの★に効いたかを利用者が確認できるようにする */
export interface MasteryEvidence {
  stars: number;
  reason: string;
  attemptId: string;
  missionId: string;
  variantId: string;
  seed: number;
  at: string;
}

export interface CategoryMastery {
  category: VulnerabilityCategory;
  stars: number;
  evidence: MasteryEvidence[];
}

export type MasterySummary = Record<VulnerabilityCategory, CategoryMastery>;

function emptyMastery(category: VulnerabilityCategory): CategoryMastery {
  return { category, stars: 0, evidence: [] };
}

/** 到達時刻は達成印の時刻、なければ演習の作成時刻 */
function reachedAt(attempt: AttemptRecord): string {
  const times = Object.values(attempt.badges).flatMap((badge) => badge.at ?? []).sort();
  return times.at(-1) ?? attempt.createdAt;
}

/** その★に初めて届いた演習だけを根拠として記録する。届いていない段階の根拠は作らない */
function raise(mastery: CategoryMastery, attempt: AttemptRecord, stars: number): void {
  if (stars <= mastery.stars) return;
  const step = MASTERY_STEPS.find((candidate) => candidate.stars === stars);
  if (!step) throw new Error(`習熟度の段階 ${stars} はありません`);
  mastery.evidence.push({
    stars, reason: step.reason,
    attemptId: attempt.attemptId, missionId: attempt.missionId, variantId: attempt.variantId, seed: attempt.seed, at: reachedAt(attempt),
  });
  mastery.stars = stars;
}

/** 同じ条件（同じ課題・variant・seed）の繰り返しは別条件に数えない */
const conditionKey = (attempt: AttemptRecord) => `${attempt.missionId}\u0000${attempt.variantId}\u0000${attempt.seed}`;

/**
 * 記録を作成順に見て、分類ごとの★と根拠を返す。★は記録上の達成印で決まり、対策の取り消しや現在の構成の合否では下がらない。
 * 分類の分からない課題（categories にない ID）は数えない。
 */
export function masteryFromAttempts(attempts: readonly AttemptRecord[], categories: MissionCategories): MasterySummary {
  const summary = Object.fromEntries(VULNERABILITY_CATEGORIES.map((category) => [category, emptyMastery(category)])) as MasterySummary;
  const completed = new Map<VulnerabilityCategory, Set<string>>();
  const sorted = [...attempts].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  for (const attempt of sorted) {
    const category = categories[attempt.missionId];
    if (category === undefined) continue;
    const mastery = summary[category];
    const { badges } = attempt;
    if (badges.reproduction.achieved) raise(mastery, attempt, 1);
    if (badges.defense.achieved) raise(mastery, attempt, 2);
    if (!allBadgesAchieved(attempt)) continue;
    const conditions = completed.get(category) ?? new Set<string>();
    completed.set(category, conditions);
    conditions.add(conditionKey(attempt));
    for (let stars = 3; stars <= Math.min(MASTERY_MAX, 2 + conditions.size); stars++) raise(mastery, attempt, stars);
  }
  return summary;
}
