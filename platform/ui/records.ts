// 記録ページ（spec §10）。分類ごとの習熟度・実績と、進捗の書き出し・読み込み・削除を課題一覧から分けて置く。
// 冒頭で「達成印 → 習熟度の★ → 復習で定着」という伸び方を 1 段落で説明する。XP・復習・週間目標は課題一覧の「取り組み」
import type { MissionPack } from '../contract';
import type { ProfileSummary } from '../progress/profile';
import { achievementList } from './achievement-list';
import { h } from './dom';
import { masteryList } from './mastery';

export interface ProgressToolActions {
  exportProgress(): void;
  importProgress(file: File): void;
  clearProgress(): void;
}

const HOW_TO_GROW =
  '課題を解くと「再現・防御・理解」の達成印が付き、分類ごとの習熟度が ★1 → ★2 → ★3 と上がります。' +
  '同じ課題を別の条件（新しい seed・別の設問）で解き直すと ★4・★5 になり、復習クエストで別の設問に正解していくと「復習で定着」が付きます。' +
  'XP は取り組みへの報酬で、習熟度や達成印の判定とは別に数えます。';

/** 進捗の道具。書き出し・読み込み・削除 */
function progressTools(actions: ProgressToolActions): HTMLElement {
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    tabIndex: -1,
    'aria-hidden': true,
    on: {
      change: () => {
        const file = fileInput.files?.[0];
        if (file) actions.importProgress(file);
        fileInput.value = '';
      },
    },
  });
  return h(
    'section',
    { class: 'progress-tools', 'aria-labelledby': 'progress-tools-title', 'data-anchor': 'progress-export' },
    h('h2', { id: 'progress-tools-title' }, '進捗'),
    h('p', { class: 'note' }, '進捗はこのブラウザの中だけに保存されます。別のブラウザへ移すときは書き出したファイルを読み込みます。'),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'button', on: { click: () => actions.exportProgress() } }, '進捗を書き出す'),
      h('button', { type: 'button', class: 'button', on: { click: () => fileInput.click() } }, '進捗を読み込む'),
      h('button', { type: 'button', class: 'button button-danger', on: { click: () => actions.clearProgress() } }, '進捗をすべて削除'),
      fileInput,
    ),
  );
}

/** カタログの課題が扱う脆弱性の分類を、カタログの順に重複なく集める（習熟度の並び）。練習課題は飛ばす */
const categoriesOf = (packs: readonly MissionPack[]) => [...new Set(packs.flatMap((pack) => pack.manifest.vulnerability?.category ?? []))];

/**
 * 記録ページ。保存済みの記録から導いた習熟度と実績だけを置く。
 * storageWarning があれば、保存できない旨と書き出しの案内を先頭に出す
 */
export function recordsPage(
  { achievements, mastery }: ProfileSummary,
  packs: readonly MissionPack[],
  storageWarning: string | null,
  actions: ProgressToolActions,
): HTMLElement {
  return h(
    'div',
    { class: 'records-page' },
    h(
      'header',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-text' },
        h('h1', { id: 'records-title', tabIndex: -1 }, '記録'),
        h('p', { class: 'hero-lead' }, HOW_TO_GROW),
      ),
    ),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    h('div', { class: 'records-grid' }, masteryList(mastery, categoriesOf(packs)), achievementList(achievements)),
    progressTools(actions),
  );
}
