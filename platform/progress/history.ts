// 進捗の改善履歴を検査し、保存と同じ上限で読み込む。
import { MAX_HISTORY, RESULT_GROUPS, type Checker, type VerificationEntry } from '../contract';

export const MAX_TEXT = 4096;

/** 非負整数を検査し、違反は検査器へ記録する。 */
export function count(checker: Checker, path: string, value: unknown): number {
  const number = checker.num(path, value);
  if (!Number.isInteger(number) || number < 0) checker.fail(path, '非負整数が必要です');
  return number;
}

function entry(checker: Checker, path: string, value: unknown): VerificationEntry {
  const record = checker.obj(path, value);
  const groups = checker.obj(`${path}.groups`, record.groups);
  return {
    runId: checker.str(`${path}.runId`, record.runId, MAX_TEXT),
    at: checker.str(`${path}.at`, record.at, MAX_TEXT),
    defenseId: record.defenseId === null ? null : checker.str(`${path}.defenseId`, record.defenseId, MAX_TEXT),
    passed: checker.bool(`${path}.passed`, record.passed),
    undetermined: count(checker, `${path}.undetermined`, record.undetermined),
    groups: Object.fromEntries(RESULT_GROUPS.map((group) => {
      const at = `${path}.groups.${group}`;
      const raw = checker.obj(at, groups[group]);
      const passed = count(checker, `${at}.passed`, raw.passed);
      const total = count(checker, `${at}.total`, raw.total);
      if (passed > total) checker.fail(at, '合格数は総数以下にしてください');
      return [group, { passed, total }];
    })) as VerificationEntry['groups'],
  };
}

/** 旧版で存在しない履歴は補完する。上限超過時は最新の100件を保持する。 */
export function readHistory(checker: Checker, path: string, value: unknown): VerificationEntry[] {
  if (value === undefined) return [];
  const records = checker.list(path, value);
  const start = Math.max(0, records.length - MAX_HISTORY);
  return records.slice(start).map((record, index) => entry(checker, `${path}[${start + index}]`, record));
}
