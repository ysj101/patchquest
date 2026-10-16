// 旧記録にない進捗項目を、残っている検証履歴と閲覧記録から一度だけ補う。
import { initialAttemptProgress, type AttemptRecord } from './attempt';

type AddedFields = 'firstPass' | 'verifications' | 'normalBroken' | 'history' | 'milestones';
type LegacyAttempt = Omit<AttemptRecord, AddedFields> & Partial<Pick<AttemptRecord, AddedFields>>;

function firstPassFromHistory(record: AttemptRecord): AttemptRecord['firstPass'] {
  const index = record.history.findIndex((entry) => entry.passed);
  const first = record.history[index];
  if (!first) return null;
  return {
    at: first.at,
    verifications: index + 1,
    normalBroken: record.history.slice(0, index).some(({ groups }) => groups.normal.passed < groups.normal.total),
    hintsUsed: record.hintsOpened.length > 0 || record.solutionViewed,
  };
}

/** 旧JSONとIndexedDBに共通の補完。既存の初回合格（nullを含む）は上書きしない。 */
export function completeAttempt(record: LegacyAttempt): AttemptRecord {
  const completed: AttemptRecord = { ...initialAttemptProgress(), ...record };
  return {
    ...completed,
    firstPass: record.firstPass === undefined ? firstPassFromHistory(completed) : record.firstPass,
    verifications: record.verifications ?? completed.history.length,
    normalBroken: record.normalBroken ?? completed.history.some(({ groups }) => groups.normal.passed < groups.normal.total),
  };
}
