// 記録ページの「続ける仕組み」（復習クエストと週間目標）を、保存済みの記録と進捗の保存先からまとめて組み立てる
import type { AttemptRecord, MissionPack } from '../contract';
import type { ProfileSummary } from '../progress/profile';
import { pickReview, reviewCandidates, type ReviewEntry } from '../progress/review';
import type { ProgressStore } from '../progress/store';
import { weeklyActivity, type WeeklyGoalId } from '../progress/weekly-goal';
import { reviewQuest } from './review-quest';
import { weeklyGoal } from './weekly-goal';

export interface HabitDeps {
  packs: readonly MissionPack[];
  records: readonly AttemptRecord[];
  profile: ProfileSummary;
  store: Pick<ProgressStore, 'recordReview' | 'setWeeklyGoal'>;
  /** 一覧を描き直す */
  refresh: (message?: string) => void;
  now?: () => Date;
  random?: () => number;
}

const secureRandom = () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;

export function habitSections({ packs, records, profile, store, refresh, now = () => new Date(), random = secureRandom }: HabitDeps): HTMLElement[] {
  const question = pickReview(reviewCandidates(packs, records), profile.reviews.at(-1), random);
  const refreshList = () => refresh();
  const activity = weeklyActivity(records, profile.reviews, profile.weeklyGoal, now());
  const answer = async (entry: ReviewEntry) => ({ rewarded: (await store.recordReview(entry)).xp.total > profile.xp.total });
  const setWeeklyGoal = (goal: WeeklyGoalId | null) => void store.setWeeklyGoal(goal).then(() => refresh(goal === null ? '週間目標を外しました' : '週間目標を設定しました'));
  return [reviewQuest(question, { answer, next: refreshList }, now), weeklyGoal(activity, { setWeeklyGoal })];
}
