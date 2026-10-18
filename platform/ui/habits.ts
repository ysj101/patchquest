// 課題一覧の「取り組み」（復習クエスト・週間目標・XP）。保存済みの記録と進捗の保存先から組み立て、次の一歩の直下に置く
import type { AttemptRecord, MissionPack } from '../contract';
import type { ProfileSummary } from '../progress/profile';
import { pickReview, reviewCandidates, type ReviewEntry } from '../progress/review';
import type { ProgressStore } from '../progress/store';
import type { XpSummary } from '../progress/xp';
import { weeklyActivity, type WeeklyGoalId } from '../progress/weekly-goal';
import { h } from './dom';
import { XP_NOTE } from './labels';
import { reviewQuest } from './review-quest';
import { weeklyGoal } from './weekly-goal';
import { xpLabel } from './xp-badge';

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

function xpSummary(xp: XpSummary): HTMLElement {
  return h('p', { class: 'xp-summary' }, xpLabel(xp), xp.nextLevelAt === null ? '' : ` ・ 次のレベルまで ${xp.nextLevelAt - xp.total} XP`);
}

/** 課題一覧の「取り組み」。復習と週間目標は記録ではなく、今やる操作と任意の設定。XP はその報酬 */
export function engagementSection({ packs, records, profile, store, refresh, now = () => new Date(), random = secureRandom }: HabitDeps): HTMLElement {
  const question = pickReview(reviewCandidates(packs, records), profile.reviews.at(-1), random);
  const refreshList = () => refresh();
  const activity = weeklyActivity(records, profile.reviews, profile.weeklyGoal, now());
  const answer = async (entry: ReviewEntry) => ({ rewarded: (await store.recordReview(entry)).xp.total > profile.xp.total });
  const setWeeklyGoal = (goal: WeeklyGoalId | null) => void store.setWeeklyGoal(goal).then(() => refresh(goal === null ? '週間目標を外しました' : '週間目標を設定しました'));
  return h(
    'section',
    { class: 'engagement', 'aria-labelledby': 'engagement-title' },
    h('h2', { id: 'engagement-title' }, '取り組み'),
    xpSummary(profile.xp),
    h('p', { class: 'note' }, XP_NOTE),
    h('div', { class: 'records-grid' }, reviewQuest(question, { answer, next: refreshList }, now), weeklyGoal(activity, { setWeeklyGoal })),
  );
}
