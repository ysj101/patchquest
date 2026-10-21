// 検証結果の総評。実行結果から合格・判定不能・不合格を決める。
import type { TestOutcome, VerificationReport } from '../contract';

type VerdictKind = 'secured' | 'undetermined' | 'insufficient';

export function failedOutcomes(report: VerificationReport): TestOutcome[] {
  return report.outcomes.filter((outcome) => !outcome.passed);
}

/** 総評の種類。実行環境のエラーは不合格に数えない */
export function verdictKind(report: VerificationReport): VerdictKind {
  const failed = failedOutcomes(report);
  if (failed.length === 0) return 'secured';
  if (failed.some((outcome) => outcome.error)) return 'undetermined';
  return 'insufficient';
}
