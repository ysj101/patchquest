// ミッション一覧（spec §10）。学習目標・目安時間・達成印・開始と、進捗の書き出し・読み込み・削除
import type { AttemptRecord, MissionPack } from '../contract';
import { sealStates, seals } from './components';
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
    h(
      'div',
      { class: 'intro' },
      h('h1', { tabIndex: -1 }, '事故を調べて、直して、確かめる'),
      h(
        'p',
        {},
        'それぞれの課題は、学習用に脆弱性を注入した架空のサービスです。問い合わせの内容から事故を再現し、対策を選んで、攻撃を防げたことと普段の使い方が壊れていないことを確かめます。',
      ),
    ),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    section('練習', 'はじめての方は、ここで操作の流れをひと通り試せます。', tutorials, actions),
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
