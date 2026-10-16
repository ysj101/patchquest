// 課題の表（spec §9, §10）。練習課題を先頭に、課題を難易度順（同じ難易度ではカタログの順）に並べ、
// 各行に脆弱性名・題名・難易度・進捗（未着手／途中／完了と達成印）・目安・開始を置く。順番は見せ方だけで、どの課題もロックしない
import { DIFFICULTIES, type AttemptRecord, type MissionPack, type VulnerabilityDef } from '../contract';
import { STAGES, allBadgesAchieved, sealStates, stageStates } from '../progress/stages';
import { seals, status, type StatusKind } from './components';
import { h } from './dom';
import { DIFFICULTY_LABEL, VULNERABILITY_CATEGORY_LABEL } from './labels';
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

/** 難易度のない課題（練習）は先頭。同じ難易度の中では元の並び（カタログの順）を保つ */
const difficultyRank = (entry: MissionEntry): number => {
  const { difficulty } = entry.pack.manifest;
  return difficulty === undefined ? -1 : DIFFICULTIES.indexOf(difficulty);
};

/** 表の並び：練習 → 入門 → 基本 → 応用。同じ難易度ではカタログの順 */
export function tableOrder(entries: MissionEntry[]): MissionEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((first, second) => difficultyRank(first.entry) - difficultyRank(second.entry) || first.index - second.index)
    .map(({ entry }) => entry);
}

/** 次に進むおすすめ。表の順で、まだ完了していない最初の課題 */
export const nextEntry = (entries: MissionEntry[]): MissionEntry | undefined => tableOrder(entries).find((entry) => !entry.completed);

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
type RowProgress = 'todo' | 'doing' | 'done';
const PROGRESS_LABEL: Record<RowProgress, { kind: StatusKind; text: string }> = {
  todo: { kind: 'idle', text: '未着手' },
  doing: { kind: 'running', text: '途中' },
  done: { kind: 'passed', text: '完了' },
};

function progressOf(entry: MissionEntry): RowProgress {
  const stages = entry.latest ? stageStates(entry.latest, entry.defenseCurrent) : [];
  const done = stages.filter((stage) => stage.state === 'done').length;
  if (done === 0) return 'todo';
  return done === STAGES.length ? 'done' : 'doing';
}

function buttons(entry: MissionEntry, actions: MissionActions): HTMLElement[] {
  const { manifest } = entry.pack;
  const { latest } = entry;
  const list =
    latest && entry.resumable
      ? [
          h('button', { type: 'button', class: 'button', on: { click: () => actions.resume(latest) } }, '続きから始める'),
          h('button', { type: 'button', class: 'button button-quiet', on: { click: () => actions.start(manifest.id) } }, '最初から始める'),
        ]
      : [h('button', { type: 'button', class: 'button', on: { click: () => actions.start(manifest.id) } }, 'この課題を始める')];
  if (entry.completed) list.push(h('button', { type: 'button', class: 'button button-quiet', on: { click: () => actions.challenge(manifest.id) } }, '別条件で挑戦する'));
  return list;
}

/** 概要・学習目標は畳んでおき、行は名前と状態だけで読めるようにする。習熟度は完了した課題にだけ添える */
function details(entry: MissionEntry, mastery: MasterySummary): HTMLElement {
  const { manifest } = entry.pack;
  return h(
    'details',
    { class: 'objectives-fold' },
    h('summary', {}, 'この課題でできるようになること'),
    h('p', { class: 'mission-summary' }, manifest.summary),
    h('ul', { class: 'objectives' }, ...manifest.learningObjectives.map((objective) => h('li', {}, objective))),
    entry.completed && manifest.vulnerability ? masteryLine(mastery[manifest.vulnerability.category]) : null,
  );
}

/** 難易度の札。練習課題は難易度の代わりに「練習」 */
function difficultyLabel(entry: MissionEntry): HTMLElement {
  const { difficulty } = entry.pack.manifest;
  return h('span', { class: 'difficulty-label', 'data-difficulty': difficulty ?? 'tutorial' }, difficulty ? DIFFICULTY_LABEL[difficulty] : '練習');
}

function row(entry: MissionEntry, actions: MissionActions, mastery: MasterySummary): HTMLElement {
  const { manifest } = entry.pack;
  const progress = progressOf(entry);
  const label = PROGRESS_LABEL[progress];
  const titleId = `mission-${manifest.id}`;
  return h(
    'li',
    { class: 'mission-row', 'data-mission': manifest.id, 'data-progress': progress },
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
      h('p', { class: 'mission-difficulty' }, difficultyLabel(entry)),
      h('div', { class: 'mission-progress' }, status(label.kind, label.text), seals(sealStates(entry.latest, entry.defenseCurrent), 'small')),
      h('p', { class: 'meta mission-time' }, `目安 ${manifest.estimatedMinutes} 分`),
      h('div', { class: 'actions mission-actions' }, ...buttons(entry, actions)),
    ),
  );
}

/** 表の見出し行。読み上げでは各行の中の文字で足りるので、見た目だけの行として置く */
const tableHead = () => h('div', { class: 'mission-table-head', 'aria-hidden': true }, ...['課題', '難易度', '進捗', '目安', ''].map((text) => h('span', {}, text)));

/** 課題の表。mastery は分類ごとの習熟度で、完了した課題の詳細にその分類の 1 行を添える */
export function missionTable(entries: MissionEntry[], actions: MissionActions, mastery: MasterySummary): HTMLElement | null {
  if (entries.length === 0) return null;
  return h(
    'section',
    { class: 'mission-section', 'aria-labelledby': 'table-title' },
    h('h2', { id: 'table-title' }, '課題の一覧'),
    h('p', { class: 'note' }, '入門から順に並んでいます。どの課題からでも始められます。'),
    h('div', { class: 'mission-table' }, tableHead(), h('ol', { class: 'mission-rows', 'aria-label': '課題の一覧' }, ...tableOrder(entries).map((entry) => row(entry, actions, mastery)))),
  );
}
