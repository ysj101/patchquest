// 検証結果の結論。グループごとに合否を1行で示し、割合は出さない。
import { RESULT_GROUPS, type ResultGroup, type TestOutcome, type VerificationReport } from '../contract';
import { status, type StatusKind } from './components';
import { h } from './dom';
import { GROUP_LABEL } from './labels';

function conclusionMark(group: ResultGroup, outcomes: TestOutcome[]): { kind: StatusKind; text: string } {
  if (outcomes.some((outcome) => outcome.error)) return { kind: 'error', text: '判定できませんでした' };
  if (outcomes.every((outcome) => outcome.passed)) return { kind: 'passed', text: '合格' };
  if (group === 'attack') return { kind: 'failed', text: '攻撃が通ってしまう' };
  return { kind: 'failed', text: '不合格' };
}

function conclusionLine(group: ResultGroup, outcomes: TestOutcome[]): HTMLElement | null {
  if (outcomes.length === 0) return null;
  const mark = conclusionMark(group, outcomes);
  return h('p', { class: 'conclusion', 'data-group': group }, `${GROUP_LABEL[group]}：`, status(mark.kind, mark.text));
}

/** いまの検証について、テストがあるグループだけ合否を1行ずつ示す。 */
export function securityComparison(report: VerificationReport): HTMLElement {
  const lines = RESULT_GROUPS.map((group) => conclusionLine(group, report.outcomes.filter((outcome) => outcome.group === group)));
  return h('div', { class: 'verify-conclusions' }, ...lines);
}
