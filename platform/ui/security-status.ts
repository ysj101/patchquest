// 安全化状況の数値と説明文を DOM に依存せず組み立てる。
import type { ResultGroup, VerificationEntry, VerificationSummary } from '../contract';
import { GROUP_LABEL, VERDICT_TITLE } from './labels';

export const SECURITY_COPY = {
  heading: '安全化状況',
  undetermined: (count: number) => `判定できなかった ${count} 件は数えていません`,
  formula: '通ったテスト数 ÷ この課題の検証で実行したテスト数',
  scope: '演習中の架空サービスの、この課題で検証した範囲の状態です。セキュリティ全般の保証や、本番で使える安全性を意味しません',
};

/** 実測がないときは 0% と表示しない。 */
export function securityLine(label: string, summary: VerificationSummary): string {
  return summary.percent === null ? `${label} 実行したテストがありません` : `${label} ${summary.passed}/${summary.total} 件（${summary.percent}%）`;
}

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
