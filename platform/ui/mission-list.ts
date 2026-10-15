// ミッション一覧（spec §10）。脆弱性の名前を先に出し、練習への入口・達成印・開始と、進捗の書き出し・読み込み・削除を置く
import type { AttemptRecord, MissionManifest, MissionPack } from '../contract';
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

/** 同梱の教材はメモアプリ（spec §8）。脆弱性の名前はマニフェストから並べ、課題 ID では分岐しない */
function heroTitle(missions: MissionEntry[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of missions) {
    const name = entry.pack.manifest.vulnerability?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length === 0) return '壊れたメモアプリで、脆弱性を直す練習';
  return `${names.join('・')}を、壊れたメモアプリで練習する`;
}

function metaLine(manifest: MissionManifest): string {
  const time = `目安 ${manifest.estimatedMinutes} 分`;
  const vuln = manifest.vulnerability;
  if (!vuln) return time;
  const parts = [vuln.cwe];
  if (vuln.category.label !== vuln.name) parts.push(vuln.category.label);
  if (vuln.owasp) parts.push(vuln.owasp);
  parts.push(time);
  return parts.join(' · ');
}

function objectives(manifest: MissionManifest): HTMLElement {
  return h(
    'details',
    { class: 'objectives' },
    h('summary', {}, 'この課題でできるようになること'),
    h('ul', {}, ...manifest.learningObjectives.map((objective) => h('li', {}, objective))),
  );
}

function startButtons(entry: MissionEntry, actions: MissionListActions): HTMLElement[] {
  const { manifest } = entry.pack;
  const latest = entry.latest;
  const begin = h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.start(manifest.id) } }, 'この課題を始める');
  if (!latest || !entry.resumable) return [begin];
  const restart = h('button', { type: 'button', class: 'button', on: { click: () => actions.start(manifest.id) } }, '最初から始める');
  return [h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.resume(latest) } }, '続きから始める'), restart];
}

function card(entry: MissionEntry, actions: MissionListActions): HTMLElement {
  const { manifest } = entry.pack;
  const titleId = `mission-${manifest.id}`;
  const vuln = manifest.vulnerability;
  const labelledBy = vuln ? `${titleId} ${titleId}-title` : titleId;
  return h(
    'article',
    { class: 'mission-card', 'aria-labelledby': labelledBy, 'data-mission': manifest.id },
    h(
      'header',
      { class: 'mission-card-head' },
      h(
        'div',
        {},
        h('h3', { id: titleId, class: vuln ? 'vuln-name' : undefined }, vuln ? vuln.name : manifest.title),
        h('p', { class: 'mission-kicker' }, metaLine(manifest)),
        vuln ? h('p', { id: `${titleId}-title`, class: 'mission-subtitle' }, manifest.title) : null,
      ),
      seals(sealStates(entry.latest, entry.defenseCurrent), 'small'),
    ),
    h('p', { class: 'mission-summary' }, manifest.summary),
    objectives(manifest),
    entry.latest && !entry.resumable ? h('p', { class: 'note' }, '教材が更新されたため、前回の続きからは始められません。') : null,
    h('div', { class: 'actions' }, ...startButtons(entry, actions)),
  );
}

function practiceButton(tutorial: MissionEntry | undefined, actions: MissionListActions): HTMLElement | null {
  if (!tutorial || tutorial.latest?.badges.understanding.achieved) return null;
  const minutes = tutorial.pack.manifest.estimatedMinutes;
  return h(
    'div',
    { class: 'hero-cta' },
    h(
      'button',
      { type: 'button', class: 'button button-primary button-chunky button-big', on: { click: () => actions.start(tutorial.pack.manifest.id) } },
      `まずは練習（${minutes} 分）`,
    ),
  );
}

function hero(tutorial: MissionEntry | undefined, missions: MissionEntry[], actions: MissionListActions): HTMLElement {
  return h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('h1', { id: 'hero-title', tabIndex: -1 }, heroTitle(missions)),
    h('p', { class: 'hero-lead' }, 'このブラウザの中だけで練習します。進め方は再現、防御、理解。'),
    practiceButton(tutorial, actions),
  );
}

function section(title: string, lead: string | null, entries: MissionEntry[], actions: MissionListActions): HTMLElement | null {
  if (entries.length === 0) return null;
  return h(
    'section',
    { class: 'mission-section' },
    h('h2', {}, title),
    lead ? h('p', { class: 'lead' }, lead) : null,
    h('div', { class: 'mission-grid' }, ...entries.map((entry) => card(entry, actions))),
  );
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
  const tutorials = entries.filter((entry) => entry.pack.manifest.kind === 'tutorial');
  const missions = entries.filter((entry) => entry.pack.manifest.kind === 'mission');
  return h(
    'div',
    { class: 'mission-list', 'data-anchor': 'mission-list' },
    hero(tutorials[0], missions, actions),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    section('練習', null, tutorials, actions),
    section('課題', 'どの課題からでも始められます。', missions, actions),
    entries.length === 0 ? h('p', { class: 'empty' }, '同梱されている課題はありません。') : null,
    h(
      'section',
      { class: 'progress-tools', 'aria-labelledby': 'progress-tools-title', 'data-anchor': 'progress-export' },
      h('h2', { id: 'progress-tools-title' }, '進捗'),
      h('p', { class: 'lead' }, 'このブラウザに保存します。別の場所へ移すときは書き出してください。'),
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
