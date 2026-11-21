// 操作で直す課題（repair: record）の対策タブの中身。対策候補を選ぶ代わりに、教材アプリの操作で加えた変更を、検証の前に再生する順に並べる
import type { RepairDef, ReplayEntry } from '../contract';
import { status } from './components';
import { h } from './dom';
import { actorLabel } from './exercise';
import { requestLabel, type AppDescribers } from './investigation';

export type RequestDescriber = AppDescribers['request'];

/** 「① 操作で直す」の見出しと説明。changes は recordedChanges で描き直す入れ物 */
export function recordSection(repair: RepairDef, changes: HTMLElement): HTMLElement[] {
  return [
    h('h3', { id: 'defense-title' }, '① 操作で直す'),
    h('p', { class: 'note' }, `対策は選びません。教材アプリを操作して直します。直した操作は「${repair.noun}」に並びます。`),
    h('h4', {}, `あなたが${repair.noun}`),
    changes,
  ];
}

/** 記録した操作の一覧。誰として何をしたかを、再生する順に示す */
export function recordedChanges(repair: RepairDef, log: readonly ReplayEntry[], describe: RequestDescriber): HTMLElement {
  if (log.length === 0) return h('p', { class: 'muted' }, `${repair.noun}はまだありません。直す操作をすると、ここに並びます。`);
  return h('ol', { class: 'repair-log' }, ...log.map((entry) => h('li', { class: 'mono' }, `${actorLabel(entry.as)} → ${requestLabel(entry.request, describe)}`)));
}

/** 検証する対象の表示 */
export function recordedSummary(repair: RepairDef, log: readonly ReplayEntry[]): HTMLElement {
  return status('idle', log.length === 0 ? `${repair.noun}はありません（弱点が残った状態）` : `${repair.noun}：${log.length} 件`);
}
