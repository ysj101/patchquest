// ミッションマップ（spec §9）。課題をカタログの並び順で推奨順路としてつなぎ、各ノードに脆弱性名・達成印・ステージ到達・開始を置く。
// 推奨は見せ方だけで、どの課題もロックしない。終点は実績「すべての課題を解決」の状態をそのまま見せる
import type { AttemptRecord, MissionPack, VulnerabilityDef } from '../contract';
import { ACHIEVEMENTS, titleFor, type UnlockedAchievements } from '../progress/achievements';
import { STAGES, sealStates, stageStates } from '../progress/stages';
import { seals, status, type StatusKind } from './components';
import { h } from './dom';
import { VULNERABILITY_CATEGORY_LABEL } from './labels';

export interface MissionEntry {
  pack: MissionPack;
  /** この課題の直近の記録 */
  latest?: AttemptRecord;
  /** 直近の記録の防御が、現在の構成で確認済みか */
  defenseCurrent: boolean;
  /** 続きから始められるか（教材の版が記録と同じ） */
  resumable: boolean;
}

export interface MissionActions {
  start(packId: string): void;
  resume(record: AttemptRecord): void;
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

function card(entry: MissionEntry, actions: MissionActions): HTMLElement {
  const { manifest } = entry.pack;
  const titleId = `mission-${manifest.id}`;
  const { latest } = entry;
  const buttons =
    latest && entry.resumable
      ? [
          h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.resume(latest) } }, '続きから始める'),
          h('button', { type: 'button', class: 'button', on: { click: () => actions.start(manifest.id) } }, '最初から始める'),
        ]
      : [h('button', { type: 'button', class: 'button button-primary', on: { click: () => actions.start(manifest.id) } }, 'この課題を始める')];
  return h(
    'article',
    { class: 'mission-card', 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'mission-card-head' },
      h('div', {}, manifest.vulnerability ? vulnerabilityLabel(manifest.vulnerability) : null, h('h3', { id: titleId }, manifest.title), h('p', { class: 'meta' }, `目安 ${manifest.estimatedMinutes} 分`)),
      seals(sealStates(entry.latest, entry.defenseCurrent), 'small'),
    ),
    h('p', { class: 'mission-summary' }, manifest.summary),
    h('details', { class: 'objectives-fold' }, h('summary', {}, 'この課題でできるようになること'), h('ul', { class: 'objectives' }, ...manifest.learningObjectives.map((objective) => h('li', {}, objective)))),
    entry.latest && !entry.resumable ? h('p', { class: 'note' }, '教材が更新されたため、前回の続きからは始められません。') : null,
    h('div', { class: 'actions' }, ...buttons),
  );
}

/** 未着手・途中・完了を、ステージの到達数（直近の記録）から導く。記録がなければ未着手 */
type NodeProgress = 'todo' | 'doing' | 'done';
const PROGRESS_LABEL: Record<NodeProgress, { kind: StatusKind; text: string }> = {
  todo: { kind: 'idle', text: '未着手' },
  doing: { kind: 'running', text: '途中' },
  done: { kind: 'passed', text: '完了' },
};

function progressOf(entry: MissionEntry): { state: NodeProgress; done: number; total: number } {
  const stages = entry.latest ? stageStates(entry.latest, entry.defenseCurrent) : [];
  const done = stages.filter((stage) => stage.state === 'done').length;
  if (done === 0) return { state: 'todo', done, total: STAGES.length };
  return { state: done === STAGES.length ? 'done' : 'doing', done, total: STAGES.length };
}

function node(entry: MissionEntry, marker: string, markerLabel: string, actions: MissionActions): HTMLElement {
  const { manifest } = entry.pack;
  const progress = progressOf(entry);
  const label = PROGRESS_LABEL[progress.state];
  return h(
    'li',
    { class: 'map-node', 'data-mission': manifest.id, 'data-progress': progress.state },
    h('div', { class: 'map-marker', 'aria-hidden': true }, marker),
    h(
      'div',
      { class: 'map-body' },
      h('p', { class: 'map-status' }, h('span', { class: 'visually-hidden' }, `${markerLabel}：`), status(label.kind, label.text), h('span', { class: 'meta' }, `ステージ ${progress.done} / ${progress.total}`)),
      card(entry, actions),
    ),
  );
}

/** 終点。実績「すべての課題を解決」の解除状況と、いまの称号を見せる（中身のない飾りは置かない） */
function goalNode(achievements: UnlockedAchievements): HTMLElement {
  const unlockedAt = achievements['all-missions'];
  const unlocked = unlockedAt !== undefined;
  const all = ACHIEVEMENTS.find((achievement) => achievement.id === 'all-missions');
  if (!all) throw new Error('実績 all-missions が定義されていません');
  const count = Object.keys(achievements).length;
  return h(
    'li',
    { class: 'map-node map-goal', 'data-progress': unlocked ? 'done' : 'todo' },
    h('div', { class: 'map-marker', 'aria-hidden': true }, 'GOAL'),
    h(
      'div',
      { class: 'map-body' },
      h('p', { class: 'map-status' }, h('span', { class: 'visually-hidden' }, 'ゴール：'), unlocked ? status('passed', '解除済み') : status('idle', '未解除')),
      h('h3', {}, all.name),
      h('p', { class: 'note' }, unlocked ? h('span', {}, '解除日時：', h('time', { dateTime: unlockedAt }, unlockedAt)) : all.description),
      h('p', { class: 'meta' }, `いまの称号：${titleFor(count)}`),
    ),
  );
}

/** 練習課題を START に置き、課題をカタログの順に番号付きでつなぐ。順路はおすすめで、どこからでも始められる */
export function missionMap(entries: MissionEntry[], achievements: UnlockedAchievements, actions: MissionActions): HTMLElement | null {
  if (entries.length === 0) return null;
  const tutorials = entries.filter((entry) => entry.pack.manifest.kind === 'tutorial');
  const missions = entries.filter((entry) => entry.pack.manifest.kind === 'mission');
  return h(
    'section',
    { class: 'mission-section', 'aria-labelledby': 'map-title' },
    h('h2', { id: 'map-title' }, 'おすすめの順路'),
    h('p', { class: 'lead' }, '上から順に進むのがおすすめですが、どの課題からでも始められます。練習は操作ガイドつきで、何度でもやり直せます。'),
    h(
      'ol',
      { class: 'mission-map', 'aria-label': 'おすすめの順路' },
      ...tutorials.map((entry) => node(entry, 'START', '練習', actions)),
      ...missions.map((entry, index) => node(entry, String(index + 1), `課題 ${index + 1}`, actions)),
      goalNode(achievements),
    ),
  );
}
