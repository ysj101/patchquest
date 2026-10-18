// ミッション一覧（spec §10）。「見出しと 1 行の説明と次の一歩 → 取り組み（XP・復習・週間目標）→ 難易度順の課題の表」を置く。
// 習熟度・実績と進捗の道具は記録ページ（records.ts）にある
import type { AttemptRecord } from '../contract';
import { settingsButton } from './components';
import { missionTable, nextEntry, type MissionEntry } from './mission-table';
import type { MasterySummary } from '../progress/mastery';
import { h } from './dom';

export type { MissionEntry } from './mission-table';

export interface MissionListActions {
  openSettings(): void;
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

export interface MissionListOptions {
  /** 分類ごとの習熟度。完了した課題の行に 1 行添える */
  mastery: MasterySummary;
  /** 次の一歩の直下に置く「取り組み」（XP・復習クエスト・週間目標） */
  engagement: HTMLElement;
  /** 保存できない理由。あれば先頭に出す */
  storageWarning: string | null;
}

export function missionList(entries: MissionEntry[], actions: MissionListActions, { mastery, engagement, storageWarning }: MissionListOptions): HTMLElement {
  return h(
    'div',
    { class: 'mission-list', 'data-anchor': 'mission-list' },
    hero(entries, actions),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、記録ページの「進捗を書き出す」で保存してください。`)
      : null,
    engagement,
    missionTable(entries, actions, mastery),
    entries.length === 0 ? h('p', { class: 'empty' }, '同梱されている課題はありません。') : null,
  );
}
