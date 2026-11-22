// 週間目標の選択肢と、ローカル時刻の日付キー。週間目標の画面は外したので、選択肢は保存済みの進捗に残る選択を読むためだけに持つ
export const WEEKLY_GOAL_IDS = ['once', 'few'] as const;
export type WeeklyGoalId = (typeof WEEKLY_GOAL_IDS)[number];

/** ローカル時刻の日付キー（同じ日の取り組みを 1 回にまとめる） */
export function localDayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}
