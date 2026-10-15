// 検証ごとの対策・合否・グループ別の変化を時刻順で示す。
import { RESULT_GROUPS, summarizeVerification, type VerificationEntry } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';
import { h } from './dom';
import { GROUP_LABEL } from './labels';
import { groupLine, historyVerdict, SECURITY_COPY } from './security-status';

function historyItem(entry: VerificationEntry, previous: VerificationEntry['groups'] | null, snapshot: ExerciseSnapshot): HTMLElement {
  const label = entry.defenseId === null ? '対策なし' : snapshot.pack.manifest.defenses.find((defense) => defense.id === entry.defenseId)?.label
    ?? `対策 ${entry.defenseId}（この版の課題にはありません）`;
  const date = new Date(entry.at);
  const time = Number.isNaN(date.getTime()) ? entry.at : date.toLocaleString('ja-JP');
  return h('li', { class: 'result-group' },
    h('time', { dateTime: entry.at }, time),
    h('p', {}, `${label}／${historyVerdict(entry)}`),
    entry.undetermined > 0 ? h('p', { class: 'note' }, SECURITY_COPY.undetermined(entry.undetermined)) : null,
    h('ul', {}, ...RESULT_GROUPS.map((group) => h('li', {}, groupLine(group, entry.groups)))),
    h('p', { class: 'note' }, previous
      ? RESULT_GROUPS.map((group) => `${GROUP_LABEL[group]} ${previous[group].passed}→${entry.groups[group].passed}`).join('／')
      : '修正前の検証結果がないため、変化は判定できません'),
  );
}

/** 対策を取り消した後も残る履歴。最初の比較元は再実測した修正前の状態。 */
export function securityHistory(snapshot: ExerciseSnapshot): HTMLElement | null {
  if (snapshot.attempt.history.length === 0) return null;
  let previous = snapshot.vulnerableVerification ? summarizeVerification(snapshot.vulnerableVerification).groups : null;
  const items = snapshot.attempt.history.map((entry) => {
    const item = historyItem(entry, previous, snapshot);
    previous = entry.groups;
    return item;
  });
  return h('section', { class: 'security-history tool-section' }, h('h3', {}, '改善履歴'), h('ol', {}, ...items));
}
