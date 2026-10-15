// ミッション一覧（spec §10）。何をする場所かの説明と練習への入口、学習目標・目安時間・達成印・開始と、進捗の書き出し・読み込み・削除
import type { AttemptRecord, MissionPack } from '../contract';
import { sealStates, seals, settingsButton } from './components';
import { h } from './dom';

export interface MissionEntry {
  pack: MissionPack;
  /** この課題の直近の記録 */
  latest?: AttemptRecord;
  /** 直近の記録の防御が、現在の構成で確認済みか */
  defenseCurrent: boolean;
  /** 続きから始められるか（教材の版が記録と同じ） */
  resumable: boolean;
}

export interface MissionListActions {
  openSettings(): void;
  start(packId: string): void;
  resume(record: AttemptRecord): void;
  exportProgress(): void;
  importProgress(file: File): void;
  clearProgress(): void;
}

function card(entry: MissionEntry, actions: MissionListActions): HTMLElement {
  const { manifest } = entry.pack;
  const titleId = `mission-${manifest.id}`;
  const buttons =
    entry.latest && entry.resumable
      ? [
          h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.resume(entry.latest!) } }, '続きから始める'),
          h('button', { type: 'button', class: 'button', on: { click: () => actions.start(manifest.id) } }, '最初から始める'),
        ]
      : [h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.start(manifest.id) } }, 'この課題を始める')];
  return h(
    'article',
    { class: 'mission-card', 'aria-labelledby': titleId, 'data-mission': manifest.id },
    h('header', { class: 'mission-card-head' }, h('h3', { id: titleId }, manifest.title), seals(sealStates(entry.latest, entry.defenseCurrent), 'small')),
    h('p', { class: 'mission-summary' }, manifest.summary),
    h('h4', { class: 'eyebrow' }, 'この課題でできるようになること'),
    h('ul', { class: 'objectives' }, ...manifest.learningObjectives.map((o) => h('li', {}, o))),
    h('p', { class: 'meta' }, `目安 ${manifest.estimatedMinutes} 分`),
    entry.latest && !entry.resumable ? h('p', { class: 'note' }, '教材が更新されたため、前回の続きからは始められません。') : null,
    h('div', { class: 'actions' }, ...buttons),
  );
}

/** 何をする場所かを一目で示す。3 つの検印（再現・防御・理解）が、そのまま課題の進め方になっている */
const FLOW: { label: string; title: string; text: string }[] = [
  { label: '再現', title: 'こわす', text: '不具合を自分の操作で起こしてみる' },
  { label: '防御', title: 'なおす', text: '直し方を選び、自動テストで合否を確かめる' },
  { label: '理解', title: 'ふりかえる', text: 'なぜ起きたか、どう防ぐかを確かめる' },
];

function hero(tutorial: MissionEntry | undefined, actions: MissionListActions): HTMLElement {
  const finished = tutorial?.latest?.badges.understanding.achieved;
  return h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('header', { class: 'actions' }, h('h1', { id: 'hero-title', tabIndex: -1 }, 'わざと壊したアプリで、こわして、なおして、たしかめる。'), settingsButton(() => actions.openSettings())),
    h(
      'p',
      { class: 'hero-lead' },
      'PatchQuest は、アプリのセキュリティの不具合を自分の手で再現し、直し方を選んで、自動テストで確かめる練習場です。すべてこのブラウザの中で動き、本物のサービスには触れません。',
    ),
    h(
      'ol',
      { class: 'hero-flow', 'aria-label': '課題の進め方' },
      ...FLOW.map((flow, i) =>
        h(
          'li',
          { class: 'hero-step' },
          h('span', { class: 'seal-stamp', 'aria-hidden': true }, h('span', { class: 'seal-mark' }, String(i + 1)), h('span', { class: 'seal-label' }, flow.label)),
          h('span', { class: 'hero-step-text' }, h('strong', {}, flow.title), flow.text),
        ),
      ),
    ),
    tutorial && !finished
      ? h(
          'div',
          { class: 'hero-cta' },
          h(
            'button',
            { type: 'button', class: 'button button-primary button-chunky button-big', on: { click: () => actions.start(tutorial.pack.manifest.id) } },
            `まずは練習（${tutorial.pack.manifest.estimatedMinutes} 分）`,
          ),
          h('p', { class: 'note' }, '操作ガイドつきで、流れをひと通り体験できます。'),
        )
      : null,
  );
}

function section(title: string, lead: string, entries: MissionEntry[], actions: MissionListActions): HTMLElement | null {
  if (entries.length === 0) return null;
  return h('section', { class: 'mission-section' }, h('h2', {}, title), h('p', { class: 'lead' }, lead), h('div', { class: 'mission-grid' }, ...entries.map((e) => card(e, actions))));
}

export function missionList(entries: MissionEntry[], storageWarning: string | null, actions: MissionListActions): HTMLElement {
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
  const tutorials = entries.filter((e) => e.pack.manifest.kind === 'tutorial');
  const missions = entries.filter((e) => e.pack.manifest.kind === 'mission');
  return h(
    'div',
    { class: 'mission-list', 'data-anchor': 'mission-list' },
    hero(tutorials[0], actions),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    section('練習', '操作ガイドつきの短い課題です。何度でもやり直せます。', tutorials, actions),
    section('課題', 'どの課題からでも始められます。', missions, actions),
    entries.length === 0 ? h('p', { class: 'empty' }, '同梱されている課題はありません。') : null,
    h(
      'section',
      { class: 'progress-tools', 'aria-labelledby': 'progress-tools-title', 'data-anchor': 'progress-export' },
      h('h2', { id: 'progress-tools-title' }, '進捗'),
      h('p', { class: 'lead' }, '進捗はこのブラウザの中だけに保存されます。別のブラウザへ移すときは書き出したファイルを読み込みます。'),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'button', on: { click: actions.exportProgress } }, '進捗を書き出す'),
        h('button', { type: 'button', class: 'button', on: { click: () => fileInput.click() } }, '進捗を読み込む'),
        h('button', { type: 'button', class: 'button button-danger', on: { click: actions.clearProgress } }, '進捗をすべて削除'),
        fileInput,
      ),
    ),
  );
}
