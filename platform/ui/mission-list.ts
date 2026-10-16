// ミッション一覧（spec §10）。どの脆弱性を練習する場所かを脆弱性名で示し、練習への入口、推奨順路のマップ（課題ごとの脆弱性名・達成印・ステージ到達・開始）と、進捗の書き出し・読み込み・削除を置く
import type { AttemptRecord } from '../contract';
import { settingsButton } from './components';
import type { ProfileSummary } from '../progress/profile';
import { achievementList } from './achievement-list';
import { XP_NOTE } from './labels';
import { missionMap, type MissionEntry } from './mission-map';
import { xpLabel } from './xp-badge';
import { h } from './dom';

export type { MissionEntry } from './mission-map';

export interface MissionListActions {
  openSettings(): void;
  start(packId: string): void;
  resume(record: AttemptRecord): void;
  exportProgress(): void;
  importProgress(file: File): void;
  clearProgress(): void;
}

/** 何をする場所かを一目で示す。3 つの検印（再現・防御・理解）が、そのまま課題の進め方になっている */
const FLOW: { label: string; title: string }[] = [
  { label: '再現', title: 'こわす' },
  { label: '防御', title: 'なおす' },
  { label: '理解', title: 'ふりかえる' },
];

/** 練習する脆弱性の通称をカタログの順に並べる（同じ脆弱性の課題が複数あっても 1 回）。課題がないときは何を練習する場所かだけを書く */
function heroLead(missions: MissionEntry[]): string {
  const names = [...new Set(missions.flatMap((entry) => entry.pack.manifest.vulnerability?.name ?? []))];
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

export function missionList(entries: MissionEntry[], storageWarning: string | null, actions: MissionListActions, { xp, achievements }: ProfileSummary): HTMLElement {
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
    storageWarning
      ? h('p', { class: 'banner banner-warn', role: 'status' }, `${storageWarning}。進捗はこの画面を閉じると消えるため、「進捗を書き出す」で保存してください。`)
      : null,
    missionMap(entries, achievements, actions),
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
