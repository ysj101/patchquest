// ミッション一覧（spec §10）。「見出しと 1 行の説明と次の一歩 → 難易度順の課題の表」だけを置く。
// XP・習熟度・実績・復習・週間目標と進捗の道具は記録ページ（records.ts）にあり、ここでは復習があるときの 1 行の案内だけを出す
import type { AttemptRecord } from '../contract';
import { settingsButton } from './components';
import { missionTable, nextEntry, type MissionEntry } from './mission-table';
import type { MasterySummary } from '../progress/mastery';
import { h } from './dom';

export type { MissionEntry } from './mission-table';

export interface MissionListActions {
  openSettings(): void;
  openRecords(): void;
  start(packId: string): void;
  resume(record: AttemptRecord): void;
  challenge(packId: string): void;
}

/** 何をする場所かの 1 行。脆弱性の数や名前は表の各行が示すので、ここでは列挙しない */
const HERO_LEAD = 'わざと壊したアプリで、セキュリティの不具合を自分の手で再現し、直し方を選んで、自動テストで確かめる練習場です。すべてこのブラウザの中で動き、本物のサービスには触れません。';

/** 次の一歩。練習が終わっていなければ練習、途中の課題があればその続き。どちらもなければ置かない */
function nextAction(entries: MissionEntry[], actions: MissionListActions): HTMLElement | null {
  const tutorial = entries.find((entry) => entry.pack.manifest.kind === 'tutorial');
  if (tutorial && !tutorial.latest?.badges.understanding.achieved) {
    const label = `まずは練習（${tutorial.pack.manifest.estimatedMinutes} 分）`;
    return h('button', { type: 'button', class: 'button button-primary button-big', on: { click: () => actions.start(tutorial.pack.manifest.id) } }, label);
  }
  const next = nextEntry(entries);
  const record = next?.latest;
  if (!next || !record || !next.resumable) return null;
  const name = next.pack.manifest.vulnerability?.name ?? next.pack.manifest.title;
  return h('button', { type: 'button', class: 'button button-primary button-big', on: { click: () => actions.resume(record) } }, `続きから：${name}`);
}

function hero(entries: MissionEntry[], actions: MissionListActions): HTMLElement {
  return h(
    'header',
    { class: 'hero' },
    h('div', { class: 'hero-text' }, h('h1', { id: 'hero-title', tabIndex: -1 }, '課題'), h('p', { class: 'hero-lead' }, HERO_LEAD)),
    h('div', { class: 'actions' }, nextAction(entries, actions), settingsButton(() => actions.openSettings())),
  );
}

/** 復習を出せるときだけ、記録ページへの 1 行の案内を置く（通知やメールは送らない。起動時に画面で知らせるだけ） */
function reviewNotice(actions: MissionListActions): HTMLElement {
  return h(
    'p',
    { class: 'review-notice', role: 'status' },
    '今日の復習が 1 問あります。',
    h('button', { type: 'button', class: 'link-button', on: { click: () => actions.openRecords() } }, '記録ページで解く'),
  );
}

export interface MissionListOptions {
  /** 分類ごとの習熟度。完了した課題の行に 1 行添える */
  mastery: MasterySummary;
  /** 復習クエストに出せる問題があるか */
  reviewAvailable: boolean;
  /** 保存できない理由。あれば先頭に出す */
  storageWarning: string | null;
}

export function missionList(entries: MissionEntry[], actions: MissionListActions, { mastery, reviewAvailable, storageWarning }: MissionListOptions): HTMLElement {
  return h(
    'div',
    { class: 'mission-list', 'data-anchor': 'mission-list' },
    hero(entries, actions),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、記録ページの「進捗を書き出す」で保存してください。`)
      : null,
    reviewAvailable ? reviewNotice(actions) : null,
    missionTable(entries, actions, mastery),
    entries.length === 0 ? h('p', { class: 'empty' }, '同梱されている課題はありません。') : null,
  );
}
