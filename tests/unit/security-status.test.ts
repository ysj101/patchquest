// 安全化状況は実行して判定できたテストだけから導く。
import { describe, expect, it } from 'vitest';
import type { TestOutcome, VerificationReport } from '../../platform/contract';
import { summarizeVerification } from '../../platform/contract';
import { securityLine, groupLine, historyVerdict } from '../../platform/ui/security-status';

function report(outcomes: Partial<TestOutcome>[]): VerificationReport {
  return { runId: '検証', attemptId: '演習', configHash: '', passed: false, startedAt: '', elapsedMs: 0,
    outcomes: outcomes.map((outcome, index) => ({ testId: String(index), title: 'テスト', group: 'attack', passed: false, expected: '', actual: '', ...outcome })) };
}

describe('安全化状況', () => {
  it('判定不可を分母と分子から除き、グループ別に集計する', () => {
    expect(summarizeVerification(report([{ passed: true }, { group: 'normal', passed: true }, { group: 'regression' }, { passed: true, error: '時間切れ' }]))).toEqual({
      passed: 2, total: 3, percent: 67, undetermined: 1,
      groups: { attack: { passed: 1, total: 1 }, normal: { passed: 1, total: 1 }, regression: { passed: 0, total: 1 } },
    });
  });
  it('実行したテストがなければ割合を出さない', () => {
    const summary = summarizeVerification(report([]));
    expect(summary.percent).toBeNull();
    expect(securityLine('修正後', summary)).toBe('修正後 実行したテストがありません');
  });
  it('不十分な対策では攻撃阻止が増えず、全面停止では正常系が落ちる', () => {
    const before = summarizeVerification(report([{ group: 'normal', passed: true }, {}]));
    const insufficient = summarizeVerification(report([{ group: 'normal', passed: true }, {}]));
    const stopped = summarizeVerification(report([{ group: 'normal' }, { passed: true }]));
    expect(securityLine('修正前', before)).toBe('修正前 1/2 件（50%）');
    expect(groupLine('attack', insufficient.groups)).toBe('攻撃を防げたか 0/1 件合格');
    expect(groupLine('normal', stopped.groups)).toBe('正常な利用ができるか 0/1 件合格');
    expect(insufficient.groups.attack.passed).toBe(before.groups.attack.passed);
    expect(stopped.groups.normal.passed).toBeLessThan(before.groups.normal.passed);
  });
});

it.each([
  [true, 0, '防御できました'],
  [false, 0, 'まだ合格ではありません'],
  [false, 1, '判定できませんでした'],
  [true, 1, '判定できませんでした'],
])('履歴の合否 %s・判定不能 %s 件を「%s」と表示する', (passed, undetermined, expected) => {
  expect(historyVerdict({ passed, undetermined })).toBe(expected);
});
