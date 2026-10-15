// 判定できた検証結果を、表示と改善履歴で共用する件数に集計する。
import { RESULT_GROUPS, type VerificationReport, type VerificationEntry } from './attempt';

/** 判定できたテストの件数と割合、判定不能の件数。割合は実測がないとき null。 */
export interface VerificationSummary {
  passed: number;
  total: number;
  percent: number | null;
  groups: VerificationEntry['groups'];
  undetermined: number;
}

/** 基盤エラーは合否の分子・分母に含めない。実測がなければ割合は null。 */
export function summarizeVerification(report: VerificationReport): VerificationSummary {
  const groups = Object.fromEntries(RESULT_GROUPS.map((group) => [group, { passed: 0, total: 0 }])) as VerificationEntry['groups'];
  let undetermined = 0;
  for (const outcome of report.outcomes) {
    if (outcome.error !== undefined) {
      undetermined++;
      continue;
    }
    groups[outcome.group].total++;
    if (outcome.passed) groups[outcome.group].passed++;
  }
  const totals = Object.values(groups).reduce((sum, group) => ({ passed: sum.passed + group.passed, total: sum.total + group.total }), { passed: 0, total: 0 });
  return { ...totals, percent: totals.total === 0 ? null : Math.round(totals.passed / totals.total * 100), groups, undetermined };
}
