// 検証結果の総評。実行結果から合格・判定不能・不合格を決め、不合格だった対策の一文を返す。
import type { TestOutcome, VerificationReport } from '../contract';
import type { ExerciseSnapshot } from '../orchestrator/orchestrator';

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

/** 直近の検証が不合格で、その履歴の対策に whyItFails があるとき、その一文を返す */
export function whyDefenseFailed(snapshot: ExerciseSnapshot): string | null {
  const report = snapshot.attempt.lastVerification;
  if (report === null || verdictKind(report) !== 'insufficient') return null;
  const entry = snapshot.attempt.history.at(-1);
  if (entry === undefined || entry.runId !== report.runId) return null;
  if (entry.defenseId === null) return null;
  const defense = snapshot.pack.manifest.defenses.find((item) => item.id === entry.defenseId);
  const sentence = defense?.whyItFails;
  if (typeof sentence !== 'string') return null;
  return sentence;
}
