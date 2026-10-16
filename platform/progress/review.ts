// 復習クエスト。解決済みの課題の理解確認から 1 問を選び、回答の記録から少量の XP を導く。
// 復習だけで達成印は付かない（達成印は演習の評価のみ。A14）
import type { AttemptRecord, MissionPack, TransferQuestion } from '../contract';
import { allBadgesAchieved } from './stages';
import { localDayKey } from './weekly-goal';

/** 復習の回答 1 件。進捗ファイルの profile に保存し、XP と週間目標の計算に使う */
export type ReviewEntry = {
  at: string;
  missionId: string;
  questionId: string;
  correct: boolean;
};

/** 保存する回答の上限。超えたら古いものから捨てる */
export const MAX_REVIEWS = 500;
/** 正解 1 回の XP。同じ日の 2 回目以降は与えない（同じ手順の繰り返しで上がり続けない） */
export const REVIEW_XP = 5;

export interface ReviewQuestion {
  missionId: string;
  missionTitle: string;
  question: TransferQuestion;
}

/** 再現・防御・理解がそろった記録のある課題（練習を除く）の理解確認を、出題の候補にする */
export function reviewCandidates(packs: readonly MissionPack[], attempts: readonly AttemptRecord[]): ReviewQuestion[] {
  const completed = new Set(attempts.filter(allBadgesAchieved).map((attempt) => attempt.missionId));
  return packs
    .filter((pack) => pack.manifest.kind === 'mission' && completed.has(pack.manifest.id))
    .flatMap((pack) => pack.manifest.transferCheck.map((question) => ({ missionId: pack.manifest.id, missionTitle: pack.manifest.title, question })));
}

/** 候補から 1 問を選ぶ。直前に答えた設問は避ける（候補がそれしかなければ出す） */
export function pickReview(candidates: readonly ReviewQuestion[], previous: ReviewEntry | undefined, random: () => number): ReviewQuestion | null {
  const fresh = candidates.filter((candidate) => !(previous && candidate.missionId === previous.missionId && candidate.question.id === previous.questionId));
  const pool = fresh.length > 0 ? fresh : candidates;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null;
}

/** 正解のうち、その日の最初の 1 回だけに XP を与える */
export function reviewXp(reviews: readonly ReviewEntry[]): number {
  const rewardedDays = new Set<string>();
  for (const review of reviews) {
    if (!review.correct) continue;
    const at = new Date(review.at);
    if (Number.isNaN(at.getTime())) continue;
    rewardedDays.add(localDayKey(at));
  }
  return rewardedDays.size * REVIEW_XP;
}
