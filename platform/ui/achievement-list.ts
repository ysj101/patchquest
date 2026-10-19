// 実績の解除数・称号・解除日時を出し、条件は開いて確かめる。
import { ACHIEVEMENTS, titleFor, type AchievementId, type UnlockedAchievements } from '../progress/achievements';
import { sectionNote } from './components';
import { h } from './dom';

const NOTE = '実績は保存された記録から判定します。';
const NOTE_MORE = 'ヒントや解法を見ても減点はありません。';

function achievementItem(id: AchievementId, name: string, description: string, at: string | undefined): HTMLElement {
  return h(
    'li',
    { 'data-achievement': id },
    h('strong', {}, name),
    at === undefined ? h('p', {}, '未解除') : h('p', {}, '解除済み：', h('time', { dateTime: at }, at)),
    h('details', { class: 'summary-fold' }, h('summary', {}, '条件'), h('p', {}, description)),
  );
}

export function achievementList(unlocked: UnlockedAchievements): HTMLElement {
  const count = Object.keys(unlocked).length;
  return h(
    'section',
    { class: 'achievements', 'aria-labelledby': 'achievements-title' },
    h('h2', { id: 'achievements-title' }, '実績'),
    h('h3', {}, `称号：${titleFor(count)}（実績 ${count} / ${ACHIEVEMENTS.length}）`),
    h('ul', {}, ...ACHIEVEMENTS.map(({ id, name, description }) => achievementItem(id, name, description, unlocked[id]))),
    sectionNote(NOTE, { summary: 'ヒントと減点', text: NOTE_MORE }),
  );
}
