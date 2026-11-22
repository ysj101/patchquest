// 検証の履歴に出す件数と合否の文を DOM に依存せず組み立てる。
import type { ResultGroup, VerificationEntry } from '../contract';
import { GROUP_LABEL, VERDICT_TITLE } from './labels';

export const SECURITY_COPY = {
  undetermined: (count: number) => `判定できなかった ${count} 件は数えていません`,
};

/** 色に頼らずグループ別の合格数と判定できた件数を示す。 */
export function groupLine(group: ResultGroup, groups: VerificationEntry['groups']): string {
  const count = groups[group];
  return `${GROUP_LABEL[group]} ${count.passed}/${count.total} 件合格`;
}

/** 判定不能があれば合格・不合格より優先して表示する。 */
export function historyVerdict(entry: Pick<VerificationEntry, 'passed' | 'undetermined'>): string {
  if (entry.undetermined > 0) return '判定できませんでした';
  return entry.passed ? VERDICT_TITLE.secured : VERDICT_TITLE.insufficient;
}
