// 検証の累計と初回合格の事実を保持し、表示用の履歴だけを上限で切る。
import { MAX_HISTORY, summarizeVerification, type AttemptRecord, type VerificationReport } from '../contract';

export function recordVerification(attempt: AttemptRecord, report: VerificationReport, at: string): void {
  const { groups, undetermined } = summarizeVerification(report);
  attempt.lastVerification = report;
  attempt.verifications++;
  attempt.normalBroken ||= groups.normal.passed < groups.normal.total;
  if (report.passed && attempt.firstPass === null) {
    attempt.firstPass = {
      at, verifications: attempt.verifications, normalBroken: attempt.normalBroken,
      hintsUsed: attempt.hintsOpened.length > 0 || attempt.solutionViewed,
    };
  }
  attempt.history = [...attempt.history, {
    runId: report.runId, at, defenseId: attempt.appliedDefense,
    passed: report.passed, groups, undetermined,
  }].slice(-MAX_HISTORY);
}
