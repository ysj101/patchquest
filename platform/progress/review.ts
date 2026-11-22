// 復習の回答の記録から、少量の XP を導く。復習の出題は画面から外したので、回答が増えるのは進捗ファイルの読み込みだけ。
// 復習だけで達成印は付かない（達成印は演習の評価のみ。A14）
import { localDayKey } from './weekly-goal';

/** 復習の回答 1 件。進捗ファイルの profile に保存し、XP と習熟度の計算に使う */
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
