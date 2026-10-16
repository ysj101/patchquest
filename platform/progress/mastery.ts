// 脆弱性の分類ごとの習熟度（★0〜5）を、保存済みの演習記録から都度計算する。XP（取り組みへの報酬）とは分け、保存しない（spec §9, §13）
import type { AttemptRecord, VulnerabilityCategory } from '../contract';
import { VULNERABILITY_CATEGORIES } from '../contract';
import type { ReviewEntry } from './review';
import { achievedAt, allBadgesAchieved } from './stages';

export const MASTERY_MAX = 5;
/** 「復習で定着」と見なす、別の設問の正答数。同じ設問の繰り返しは 1 回しか数えない */
export const REVIEW_CONSOLIDATION = 3;

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
  /** 復習で正解した設問の数（設問 ID ごとに 1 回）。★の段階は変えない */
  reviewed: number;
  /** ★3 以上で、復習の正答が REVIEW_CONSOLIDATION 問以上ある */
  consolidated: boolean;
}

export type MasterySummary = Record<VulnerabilityCategory, CategoryMastery>;

/** 課題 ID の分類。進捗 JSON 由来の ID（'__proto__' など）でプロトタイプを引かないよう、自身の項目だけを見る */
function categoryOf(categories: MissionCategories, missionId: string): VulnerabilityCategory | undefined {
  return Object.hasOwn(categories, missionId) ? categories[missionId] : undefined;
}

function emptyMastery(category: VulnerabilityCategory): CategoryMastery {
  return { category, stars: 0, evidence: [], reviewed: 0, consolidated: false };
}

/** 復習の正答を分類ごとに、設問 ID 単位で数える */
function countReviews(summary: MasterySummary, reviews: readonly ReviewEntry[], categories: MissionCategories): void {
  const seen = new Set<string>();
  for (const review of reviews) {
    const category = categoryOf(categories, review.missionId);
    if (!review.correct || category === undefined) continue;
    const key = `${review.missionId}\u0000${review.questionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summary[category].reviewed++;
  }
  for (const mastery of Object.values(summary)) mastery.consolidated = mastery.stars >= 3 && mastery.reviewed >= REVIEW_CONSOLIDATION;
}

/** その★に初めて届いた演習だけを根拠として記録する。届いていない段階の根拠は作らない */
function raise(mastery: CategoryMastery, attempt: AttemptRecord, stars: number): void {
  if (stars <= mastery.stars) return;
  const step = MASTERY_STEPS.find((candidate) => candidate.stars === stars);
  if (!step) throw new Error(`習熟度の段階 ${stars} はありません`);
  mastery.evidence.push({
    stars, reason: step.reason,
    attemptId: attempt.attemptId, missionId: attempt.missionId, variantId: attempt.variantId, seed: attempt.seed, at: achievedAt(attempt),
  });
  mastery.stars = stars;
}

/** 同じ条件（同じ課題・variant・seed）の繰り返しは別条件に数えない */
const conditionKey = (attempt: AttemptRecord) => `${attempt.missionId}\u0000${attempt.variantId}\u0000${attempt.seed}`;

/**
 * 記録を作成順に見て、分類ごとの★と根拠を返す。★は記録上の達成印で決まり、対策の取り消しや現在の構成の合否では下がらない。
 * 分類の分からない課題（categories にない ID）は数えない。復習の正答は★を変えず、「復習で定着」の印にだけ効く。
 */
export function masteryFromAttempts(attempts: readonly AttemptRecord[], categories: MissionCategories, reviews: readonly ReviewEntry[] = []): MasterySummary {
  const summary = Object.fromEntries(VULNERABILITY_CATEGORIES.map((category) => [category, emptyMastery(category)])) as MasterySummary;
  const completed = new Map<VulnerabilityCategory, Set<string>>();
  const sorted = [...attempts].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  for (const attempt of sorted) {
    const category = categoryOf(categories, attempt.missionId);
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
  countReviews(summary, reviews, categories);
  return summary;
}
