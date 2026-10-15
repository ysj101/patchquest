// 対策と振り返りで共用する、実測に基づく安全化状況の比較表示。
import { RESULT_GROUPS, summarizeVerification, type VerificationReport } from '../contract';
import { h } from './dom';
import { groupLine, securityLine, SECURITY_COPY } from './security-status';

function row(label: string, phase: string, report: VerificationReport): HTMLElement {
  const summary = summarizeVerification(report);
  const filled = summary.percent === null ? 0 : Math.floor(summary.percent / 20);
  return h('div', { class: 'result-group security-row', 'data-phase': phase, 'data-complete': summary.total > 0 && summary.passed === summary.total },
    h('p', { class: 'security-count' }, securityLine(label, summary), ' ', h('span', { 'aria-hidden': true }, '●'.repeat(filled) + '○'.repeat(5 - filled))),
    h('ul', {}, ...RESULT_GROUPS.map((group) => h('li', { 'data-group': group }, groupLine(group, summary.groups)))),
    summary.undetermined > 0 ? h('p', { class: 'note' }, SECURITY_COPY.undetermined(summary.undetermined)) : null,
  );
}

/** 修正前は事前検証の実測、修正後は表示中の検証。未実測なら数値を推定しない。 */
export function securityComparison(before: VerificationReport | null, after: VerificationReport): HTMLElement {
  return h('section', { class: 'security-status tool-section' },
    h('p', { class: 'eyebrow', 'aria-hidden': true }, 'SECURITY STATUS'),
    h('h3', {}, SECURITY_COPY.heading),
    h('p', { class: 'note' }, SECURITY_COPY.formula),
    h('div', { class: 'security-pair' }, before ? row('修正前', 'before', before) : h('p', {}, '修正前の検証結果がありません'), row('修正後', 'after', after)),
    h('p', { class: 'note' }, SECURITY_COPY.scope),
  );
}
