// ミッションマップ（spec §9）。課題をカタログの並び順で推奨順路の表としてつなぎ、各行に脆弱性名・実行環境・ステージ到達・目安・開始を置く。
// 推奨は見せ方だけで、どの課題もロックしない。次に進むおすすめの 1 行だけを強調し、終点は実績「すべての課題を解決」の状態をそのまま見せる
import type { AttemptRecord, MissionPack, VulnerabilityDef } from '../contract';
import { ACHIEVEMENTS, titleFor, type UnlockedAchievements } from '../progress/achievements';
import { STAGES, allBadgesAchieved, stageStates } from '../progress/stages';
import { status, type StatusKind } from './components';
import { h } from './dom';
import { RUNTIME_LABEL, VULNERABILITY_CATEGORY_LABEL } from './labels';
import type { MasterySummary } from '../progress/mastery';
import { masteryLine } from './mastery';

export interface MissionEntry {
  pack: MissionPack;
  /** この課題の直近の記録 */
  latest?: AttemptRecord;
  /** 直近の記録の防御が、現在の構成で確認済みか */
  defenseCurrent: boolean;
  /** 続きから始められるか（教材の版が記録と同じ） */
  resumable: boolean;
  /** 再現・防御・理解がそろった記録があるか（別条件での挑戦を出す条件） */
  completed: boolean;
}

export interface MissionActions {
  start(packId: string): void;
  resume(record: AttemptRecord): void;
  /** 完了済みの課題を、新しい seed・variant と別の設問で解き直す */
  challenge(packId: string): void;
}

/** 完了済みの記録があるか。防御の現在性や対策の取り消しでは変わらない */
export const hasCompleted = (records: readonly AttemptRecord[]): boolean => records.some(allBadgesAchieved);

/** 練習課題を先に、続けて課題をカタログの順に並べる（順路の順） */
function routeOrder(entries: MissionEntry[]): MissionEntry[] {
  return [...entries.filter((entry) => entry.pack.manifest.kind === 'tutorial'), ...entries.filter((entry) => entry.pack.manifest.kind === 'mission')];
}

/** 次に進むおすすめ。順路の順で、まだ完了していない最初の課題 */
export const nextEntry = (entries: MissionEntry[]): MissionEntry | undefined => routeOrder(entries).find((entry) => !entry.completed);

/** 脆弱性の通称を主役にし、正式名・CWE・分類を添える。課題の題名より先に目に入る位置に置く */
function vulnerabilityLabel(vulnerability: VulnerabilityDef): HTMLElement {
  return h(
    'p',
    { class: 'vulnerability' },
    h('strong', { class: 'vulnerability-name' }, vulnerability.name),
    h('span', { class: 'vulnerability-detail' }, `${vulnerability.fullName} ・ ${vulnerability.cwe} ・ ${VULNERABILITY_CATEGORY_LABEL[vulnerability.category]}`),
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

/** 到達したステージ数を区切りの帯で示す。数は横の文字でも読める */
function stageBar(done: number, total: number): HTMLElement {
  return h('span', { class: 'stage-bar', 'aria-hidden': true }, ...Array.from({ length: total }, (_, i) => h('span', { 'data-done': i < done })));
}

function buttons(entry: MissionEntry, actions: MissionActions, isNext: boolean): HTMLElement[] {
  const { manifest } = entry.pack;
  const { latest } = entry;
  const main = isNext ? 'button button-primary' : 'button';
  const list =
    latest && entry.resumable
      ? [
          h('button', { type: 'button', class: main, on: { click: () => actions.resume(latest) } }, '続きから始める'),
          h('button', { type: 'button', class: 'button button-quiet', on: { click: () => actions.start(manifest.id) } }, '最初から始める'),
        ]
      : [h('button', { type: 'button', class: main, on: { click: () => actions.start(manifest.id) } }, 'この課題を始める')];
  if (entry.completed) list.push(h('button', { type: 'button', class: 'button button-quiet', on: { click: () => actions.challenge(manifest.id) } }, '別条件で挑戦する'));
  return list;
}

/** 概要・学習目標・習熟度は畳んでおき、行は名前と状態だけで読めるようにする */
function details(entry: MissionEntry, mastery: MasterySummary): HTMLElement {
  const { manifest } = entry.pack;
  return h(
    'details',
    { class: 'objectives-fold' },
    h('summary', {}, 'この課題でできるようになること'),
    h('p', { class: 'mission-summary' }, manifest.summary),
    h('ul', { class: 'objectives' }, ...manifest.learningObjectives.map((objective) => h('li', {}, objective))),
    manifest.vulnerability ? masteryLine(mastery[manifest.vulnerability.category]) : null,
  );
}

function node(entry: MissionEntry, marker: string, markerLabel: string, actions: MissionActions, mastery: MasterySummary, isNext: boolean): HTMLElement {
  const { manifest } = entry.pack;
  const progress = progressOf(entry);
  const label = PROGRESS_LABEL[progress.state];
  const titleId = `mission-${manifest.id}`;
  return h(
    'li',
    { class: 'map-node', 'data-mission': manifest.id, 'data-progress': progress.state, 'data-next': isNext ? '' : undefined },
    h('div', { class: 'map-marker', 'aria-hidden': true }, marker),
    h(
      'article',
      { class: 'mission-card', 'aria-labelledby': titleId },
      h(
        'div',
        { class: 'mission-main' },
        manifest.vulnerability ? vulnerabilityLabel(manifest.vulnerability) : null,
        h('h3', { id: titleId }, manifest.title),
        details(entry, mastery),
        entry.latest && !entry.resumable ? h('p', { class: 'note' }, '教材が更新されたため、前回の続きからは始められません。') : null,
      ),
      h('p', { class: 'mission-runtime' }, h('span', { class: 'runtime-label', 'data-runtime': manifest.runtime.adapter }, RUNTIME_LABEL[manifest.runtime.adapter])),
      h(
        'p',
        { class: 'map-status' },
        h('span', { class: 'visually-hidden' }, `${markerLabel}：`),
        status(label.kind, label.text),
        stageBar(progress.done, progress.total),
        h('span', { class: 'meta' }, `ステージ ${progress.done} / ${progress.total}`),
      ),
      h('p', { class: 'meta mission-time' }, `目安 ${manifest.estimatedMinutes} 分`),
      h('div', { class: 'actions mission-actions' }, ...buttons(entry, actions, isNext)),
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

/** 表の見出し行。読み上げでは各行の中の文字で足りるので、見た目だけの行として置く */
const tableHead = () =>
  h(
    'div',
    { class: 'mission-table-head', 'aria-hidden': true },
    h('span', {}, ''),
    h('span', {}, '課題'),
    h('span', {}, '実行環境'),
    h('span', {}, '進捗'),
    h('span', {}, '目安'),
    h('span', {}, ''),
  );

/** 練習課題を START に置き、課題をカタログの順に番号付きでつなぐ。順路はおすすめで、どこからでも始められる */
/** mastery は分類ごとの習熟度。各行の詳細に、その課題の分類の 1 行を添える */
export function missionMap(entries: MissionEntry[], achievements: UnlockedAchievements, actions: MissionActions, mastery: MasterySummary): HTMLElement | null {
  if (entries.length === 0) return null;
  const next = nextEntry(entries);
  const tutorials = entries.filter((entry) => entry.pack.manifest.kind === 'tutorial');
  const missions = entries.filter((entry) => entry.pack.manifest.kind === 'mission');
  return h(
    'section',
    { class: 'mission-section', 'aria-labelledby': 'map-title' },
    h('h2', { id: 'map-title' }, 'おすすめの順路'),
    h('p', { class: 'note' }, '上からの順がおすすめです。どの課題からでも始められます。'),
    h(
      'div',
      { class: 'mission-table' },
      tableHead(),
      h(
        'ol',
        { class: 'mission-map', 'aria-label': 'おすすめの順路' },
        ...tutorials.map((entry) => node(entry, 'START', '練習', actions, mastery, entry === next)),
        ...missions.map((entry, index) => node(entry, String(index + 1), `課題 ${index + 1}`, actions, mastery, entry === next)),
        goalNode(achievements),
      ),
    ),
  );
}
