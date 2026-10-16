// ミッション一覧（spec §10）。左のメニューと、右に「課題の見出しと次の一歩 → 推奨順路の表 → あなたの記録 → 進捗」を置く。
// 表は脆弱性名・実行環境・ステージ到達・目安・開始を 1 行にまとめ、XP・実績・習熟度・復習・週間目標は順路の下の「あなたの記録」に集める
import type { AttemptRecord, VulnerabilityDef } from '../contract';
import { settingsButton } from './components';
import type { ProfileSummary } from '../progress/profile';
import { achievementList } from './achievement-list';
import { XP_NOTE } from './labels';
import { missionMap, nextEntry, type MissionEntry } from './mission-map';
import { xpLabel } from './xp-badge';
import { masteryList } from './mastery';
import { h } from './dom';

export type { MissionEntry } from './mission-map';

export interface MissionListActions {
  openSettings(): void;
  start(packId: string): void;
  resume(record: AttemptRecord): void;
  challenge(packId: string): void;
  exportProgress(): void;
  importProgress(file: File): void;
  clearProgress(): void;
}

/** 課題が扱う脆弱性の項目をカタログの順に重複なく集める。脆弱性のない課題（練習）は飛ばす */
function distinctVulnerability<T>(missions: MissionEntry[], pick: (vulnerability: VulnerabilityDef) => T): T[] {
  return [...new Set(missions.flatMap((entry) => (entry.pack.manifest.vulnerability ? [pick(entry.pack.manifest.vulnerability)] : [])))];
}

/** 練習する脆弱性の通称をカタログの順に並べる（同じ脆弱性の課題が複数あっても 1 回）。課題がないときは何を練習する場所かだけを書く */
function heroLead(missions: MissionEntry[]): string {
  const names = distinctVulnerability(missions, (vulnerability) => vulnerability.name);
  const subject = names.length > 0 ? `${names.join('・')}の ${names.length} つを` : 'アプリのセキュリティの不具合を';
  return `${subject}、わざと壊したアプリで練習します。すべてこのブラウザの中で動き、本物のサービスには触れません。`;
}

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

function hero(entries: MissionEntry[], missions: MissionEntry[], actions: MissionListActions): HTMLElement {
  return h(
    'header',
    { class: 'hero' },
    h('div', { class: 'hero-text' }, h('h1', { id: 'hero-title', tabIndex: -1 }, '課題'), h('p', { class: 'hero-lead' }, heroLead(missions))),
    h('div', { class: 'actions' }, nextAction(entries, actions), settingsButton(() => actions.openSettings())),
  );
}

/** 左のメニュー。各区画へのページ内リンクと、進捗の保存先 */
function sideNav(): HTMLElement {
  const link = (href: string, text: string) => h('li', {}, h('a', { href, class: 'side-link' }, text));
  return h(
    'nav',
    { class: 'side-nav', 'aria-label': '一覧のメニュー' },
    h('ul', {}, link('#map-title', '課題'), link('#records-title', '記録'), link('#progress-tools-title', '進捗')),
    h('p', { class: 'meta side-nav-foot' }, '保存先：このブラウザ'),
  );
}

function records({ xp, achievements, mastery }: ProfileSummary, missions: MissionEntry[], habits: HTMLElement[]): HTMLElement {
  return h(
    'section',
    { class: 'records', 'aria-labelledby': 'records-title' },
    h(
      'div',
      { class: 'records-head' },
      h('h2', { id: 'records-title' }, 'あなたの記録'),
      h('p', { class: 'xp-summary' }, xpLabel(xp), xp.nextLevelAt === null ? '' : ` ・ 次のレベルまで ${xp.nextLevelAt - xp.total} XP`),
    ),
    h('p', { class: 'note' }, XP_NOTE),
    h('div', { class: 'records-grid' }, masteryList(mastery, distinctVulnerability(missions, (vulnerability) => vulnerability.category)), ...habits, achievementList(achievements)),
  );
}

function progressTools(actions: MissionListActions): HTMLElement {
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

/** 課題一覧。habits は習熟度の後に差し込む区画（復習クエスト・週間目標） */
export function missionList(entries: MissionEntry[], storageWarning: string | null, actions: MissionListActions, profile: ProfileSummary, habits: HTMLElement[] = []): HTMLElement {
  const missions = entries.filter((e) => e.pack.manifest.kind === 'mission');
  return h(
    'div',
    { class: 'mission-list', 'data-anchor': 'mission-list' },
    sideNav(),
    h(
      'div',
      { class: 'list-main' },
      hero(entries, missions, actions),
      storageWarning
        ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
        : null,
      missionMap(entries, profile.achievements, actions, profile.mastery),
      entries.length === 0 ? h('p', { class: 'empty' }, '同梱されている課題はありません。') : null,
      records(profile, missions, habits),
      progressTools(actions),
    ),
  );
}
