// 取り組みの週間目標。利用者が任意に選び、今週の取り組みを文字で示す。未達でも減点・喪失・警告の表現を使わない（spec §9）
import { WEEKLY_GOALS, type WeeklyActivity, type WeeklyGoalId } from '../progress/weekly-goal';
import { radioOption, sectionNote } from './components';
import { h } from './dom';

export interface WeeklyGoalActions {
  setWeeklyGoal(goal: WeeklyGoalId | null): void;
}

const NOTE = '任意の目標で、届かなくても減点や警告はありません。';
const NOTE_MORE = '週は月曜始まりで、この端末の時刻で区切ります。演習の完了と復習の回答を、1 日に何回取り組んでも 1 回として数えます。通知やメールは送りません。';

const weekLabel = (start: Date) => `${start.getMonth() + 1}/${start.getDate()} の週`;

/** 今週の回数と目標の関係を、淡々とした文で示す */
function weeklyStatusText(activity: WeeklyActivity): string {
  const week = weekLabel(activity.weekStart);
  const count = activity.count === 0 ? `${week}はまだ 0 回です` : `${week}は ${activity.count} 回取り組みました`;
  if (!activity.goal) return `${count}。`;
  return `${count}（目標：${activity.goal.label}）。${activity.reached ? '目標に届きました。' : ''}`;
}

export function weeklyGoal(activity: WeeklyActivity, actions: WeeklyGoalActions): HTMLElement {
  const options: { value: WeeklyGoalId | null; label: string }[] = [{ value: null, label: '設定しない' }, ...WEEKLY_GOALS.map((goal) => ({ value: goal.id, label: goal.label }))];
  return h(
    'section',
    { class: 'weekly-goal', 'aria-labelledby': 'weekly-goal-title' },
    h('h2', { id: 'weekly-goal-title' }, '週間目標'),
    h(
      'fieldset',
      { class: 'weekly-goal-options' },
      h('legend', {}, '取り組む回数'),
      ...options.map((option) =>
        radioOption(
          { name: 'weekly-goal', value: option.value ?? 'none', checked: (activity.goal?.id ?? null) === option.value, className: 'user-option', onChange: () => actions.setWeeklyGoal(option.value) },
          option.label,
        ),
      ),
    ),
    h('p', { class: 'weekly-status', role: 'status' }, weeklyStatusText(activity)),
    sectionNote(NOTE, { summary: '週の数え方', text: NOTE_MORE }),
  );
}
