// ミッション一覧（spec §10）。どの脆弱性を練習する場所かを脆弱性名で示し、練習への入口、課題ごとの脆弱性名・目安時間・達成印・開始と、進捗の書き出し・読み込み・削除を置く
import type { AttemptRecord, MissionPack, VulnerabilityDef } from '../contract';
import { seals, settingsButton } from './components';
import { sealStates } from '../progress/stages';
import type { ProfileSummary } from '../progress/profile';
import type { MasterySummary } from '../progress/mastery';
import { achievementList } from './achievement-list';
import { VULNERABILITY_CATEGORY_LABEL, XP_NOTE } from './labels';
import { xpLabel } from './xp-badge';
import { masteryLine, masteryList } from './mastery';
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

/** 脆弱性の通称を主役にし、正式名・CWE・分類を添える。課題の題名より先に目に入る位置に置く */
function vulnerabilityLabel(vulnerability: VulnerabilityDef): HTMLElement {
  return h(
    'p',
    { class: 'vulnerability' },
    h('strong', { class: 'vulnerability-name' }, vulnerability.name),
    h('span', { class: 'vulnerability-detail' }, `${vulnerability.fullName} ・ ${vulnerability.cwe} ・ ${VULNERABILITY_CATEGORY_LABEL[vulnerability.category]}`),
  );
}

function card(entry: MissionEntry, actions: MissionListActions, mastery: MasterySummary): HTMLElement {
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
    h(
      'header',
      { class: 'mission-card-head' },
      h('div', {}, manifest.vulnerability ? vulnerabilityLabel(manifest.vulnerability) : null, h('h3', { id: titleId }, manifest.title), h('p', { class: 'meta' }, `目安 ${manifest.estimatedMinutes} 分`), manifest.vulnerability ? masteryLine(mastery[manifest.vulnerability.category]) : null),
      seals(sealStates(entry.latest, entry.defenseCurrent), 'small'),
    ),
    h('p', { class: 'mission-summary' }, manifest.summary),
    h('details', { class: 'objectives-fold' }, h('summary', {}, 'この課題でできるようになること'), h('ul', { class: 'objectives' }, ...manifest.learningObjectives.map((o) => h('li', {}, o)))),
    entry.latest && !entry.resumable ? h('p', { class: 'note' }, '教材が更新されたため、前回の続きからは始められません。') : null,
    h('div', { class: 'actions' }, ...buttons),
  );
}

/** 何をする場所かを一目で示す。3 つの検印（再現・防御・理解）が、そのまま課題の進め方になっている */
const FLOW: { label: string; title: string }[] = [
  { label: '再現', title: 'こわす' },
  { label: '防御', title: 'なおす' },
  { label: '理解', title: 'ふりかえる' },
];

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

function hero(tutorial: MissionEntry | undefined, missions: MissionEntry[], actions: MissionListActions): HTMLElement {
  const finished = tutorial?.latest?.badges.understanding.achieved;
  return h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('header', { class: 'actions' }, h('h1', { id: 'hero-title', tabIndex: -1 }, 'わざと壊したアプリで、こわして、なおして、たしかめる。'), settingsButton(() => actions.openSettings())),
    h('p', { class: 'hero-lead' }, heroLead(missions)),
    h(
      'ol',
      { class: 'hero-flow', 'aria-label': '課題の進め方' },
      ...FLOW.map((flow, i) =>
        h(
          'li',
          { class: 'hero-step' },
          h('span', { class: 'seal-stamp', 'aria-hidden': true }, h('span', { class: 'seal-mark' }, String(i + 1)), h('span', { class: 'seal-label' }, flow.label)),
          h('strong', { class: 'hero-step-text' }, flow.title),
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

function section(title: string, lead: string, entries: MissionEntry[], actions: MissionListActions, mastery: MasterySummary): HTMLElement | null {
  if (entries.length === 0) return null;
  return h('section', { class: 'mission-section' }, h('h2', {}, title), h('p', { class: 'lead' }, lead), h('div', { class: 'mission-grid' }, ...entries.map((e) => card(e, actions, mastery))));
}

export function missionList(entries: MissionEntry[], storageWarning: string | null, actions: MissionListActions, { xp, achievements, mastery }: ProfileSummary): HTMLElement {
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
    hero(tutorials[0], missions, actions),
    h('p', { class: 'xp-summary' }, xpLabel(xp), xp.nextLevelAt === null ? '' : ` ・ 次のレベルまで ${xp.nextLevelAt - xp.total} XP`),
    h('p', { class: 'note' }, XP_NOTE),
    achievementList(achievements),
    masteryList(mastery, distinctVulnerability(missions, (vulnerability) => vulnerability.category)),
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    section('練習', '操作ガイドつきの短い課題です。何度でもやり直せます。', tutorials, actions, mastery),
    section('課題', 'どの課題からでも始められます。', missions, actions, mastery),
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
