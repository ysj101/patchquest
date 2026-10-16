// 一覧にすべての実績の条件・解除日時と、解除数に応じた称号を表示する。
import { ACHIEVEMENTS, titleFor, type UnlockedAchievements } from '../progress/achievements';
import { h } from './dom';

export function achievementList(unlocked: UnlockedAchievements): HTMLElement {
  const count = Object.keys(unlocked).length;
  return h('section', { class: 'achievements', 'aria-labelledby': 'achievements-title' },
    h('h2', { id: 'achievements-title' }, '実績'),
    h('h3', {}, `称号：${titleFor(count)}（実績 ${count} / ${ACHIEVEMENTS.length}）`),
    h('p', { class: 'note' }, '実績は保存された記録から判定します。ヒントや解法を見ても減点はありません'),
    h('ul', {}, ...ACHIEVEMENTS.map(({ id, name, description }) => {
      const at = unlocked[id];
      return h('li', { 'data-achievement': id }, h('strong', {}, name), at === undefined
        ? h('p', {}, `未解除：${description}`)
        : h('p', {}, '解除済み：', h('time', { dateTime: at }, at)));
    })),
  );
}
