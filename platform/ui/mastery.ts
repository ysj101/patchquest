// 分類ごとの習熟度の表示。★だけでなく段階の名前でも示し、判定の根拠を開いて確かめられるようにする（spec §9, §10）
import type { VulnerabilityCategory } from '../contract';
import { MASTERY_MAX, type CategoryMastery, type MasterySummary } from '../progress/mastery';
import { sectionNote } from './components';
import { h } from './dom';
import { MASTERY_LEVEL_LABEL, MASTERY_NOTE, MASTERY_NOTE_MORE, VULNERABILITY_CATEGORY_LABEL } from './labels';

function stars(mastery: CategoryMastery): HTMLElement {
  return h('span', { class: 'mastery-stars', 'aria-hidden': true }, '★'.repeat(mastery.stars) + '☆'.repeat(MASTERY_MAX - mastery.stars));
}

/** 1 行の表示。課題のカードと演習票で使う */
export function masteryLine(mastery: CategoryMastery): HTMLElement {
  return h(
    'p',
    { class: 'mastery-line', 'data-category': mastery.category, 'data-stars': String(mastery.stars) },
    h('span', { class: 'mastery-label' }, `${VULNERABILITY_CATEGORY_LABEL[mastery.category]}の習熟度`),
    stars(mastery),
    h('span', { class: 'mastery-level' }, `Lv${mastery.stars}：${MASTERY_LEVEL_LABEL[mastery.stars] ?? ''}`),
    mastery.consolidated ? h('span', { class: 'mastery-consolidated' }, '復習で定着') : null,
  );
}

/** 復習の正答が習熟度の表示にどう効いたか。★の段階は変えない */
function reviewNote(mastery: CategoryMastery): HTMLElement | null {
  if (mastery.reviewed === 0) return null;
  const text = mastery.consolidated
    ? `復習で定着：別の設問 ${mastery.reviewed} 問に正解しました（★は変わりません）`
    : `復習の正答：${mastery.reviewed} 問（★は変わりません）`;
  return h('p', { class: 'note mastery-review' }, text);
}

/** 判定の根拠。どの演習のどの達成が、どの★に効いたか */
export function masteryEvidence(mastery: CategoryMastery): HTMLElement {
  return h(
    'details',
    { class: 'mastery-evidence' },
    h('summary', {}, '判定の根拠'),
    mastery.evidence.length === 0
      ? h('p', { class: 'note' }, 'まだ達成印がありません。再現で ★1、防御で ★2、理解までそろえて ★3 になります。')
      : h(
          'ol',
          { class: 'mastery-evidence-list' },
          ...mastery.evidence.map((item) =>
            h('li', {}, `★${item.stars}：${item.reason}（課題 ${item.missionId}・seed ${item.seed}・演習票 ${item.attemptId.slice(0, 8)}）`),
          ),
        ),
    reviewNote(mastery),
  );
}

/** 一覧の先頭に置く、分類ごとの習熟度。カタログにある分類だけを並べる */
export function masteryList(summary: MasterySummary, categories: readonly VulnerabilityCategory[]): HTMLElement | null {
  if (categories.length === 0) return null;
  return h(
    'section',
    { class: 'mastery', 'aria-labelledby': 'mastery-title' },
    h('h2', { id: 'mastery-title' }, '習熟度'),
    h(
      'ul',
      { class: 'mastery-grid' },
      ...categories.map((category) => h('li', {}, masteryLine(summary[category]), masteryEvidence(summary[category]))),
    ),
    sectionNote(MASTERY_NOTE, { summary: '補足', text: MASTERY_NOTE_MORE }),
  );
}
