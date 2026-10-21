// 検証が不合格のとき、検証した対策の whyItFails だけを返す。
import { describe, expect, it } from 'vitest';
import type { AttemptRecord, TestOutcome, VerificationEntry, VerificationReport } from '../../platform/contract';
import type { ExerciseSnapshot } from '../../platform/orchestrator/orchestrator';
import { whyDefenseFailed } from '../../platform/ui/verdict';
import { makeAttempt } from '../support/attempt';
import { testPack } from '../support/test-pack';

const DISPLAY_ONLY = '表示を変えただけでは、ID を直接指定した取得が通り、他人のノートが読めました。';
const DENY_ALL = '他人のノートは読めなくなりましたが、自分のノートも読めなくなりました。';

function outcome(extra: Partial<TestOutcome> = {}): TestOutcome {
  return { testId: 'test.read-other-denied', title: '他人のノートは読めない', group: 'attack', passed: false, expected: '拒否', actual: '取得できた', ...extra };
}

function report(runId: string, extra: Partial<TestOutcome> = {}, passed = false): VerificationReport {
  return { runId, attemptId: '演習', configHash: 'c'.repeat(64), outcomes: [outcome(extra)], passed, startedAt: '2026-10-12T00:00:00Z', elapsedMs: 1 };
}

function entry(runId: string, defenseId: string | null): VerificationEntry {
  return {
    runId,
    at: '2026-10-12T00:00:00Z',
    defenseId,
    passed: false,
    undetermined: 0,
    groups: {
      attack: { passed: 0, total: 1 },
      normal: { passed: 1, total: 1 },
      regression: { passed: 1, total: 1 },
    },
  };
}

function snapshot(overrides: Partial<AttemptRecord> = {}): ExerciseSnapshot {
  return {
    attempt: makeAttempt('演習', overrides),
    pack: testPack,
    refs: {},
    implementations: {},
    preflight: [],
    blocked: null,
    platformError: null,
    defenseCurrent: false,
    vulnerableVerification: null,
  };
}

describe('不合格の対策の一文', () => {
  it('誤った対策の検証が不合格なら、その対策の一文を返す', () => {
    const view = snapshot({ lastVerification: report('run-1'), history: [entry('run-1', 'display-only')], appliedDefense: 'display-only' });
    expect(whyDefenseFailed(view)).toBe(DISPLAY_ONLY);
  });

  it('合格なら一文を返さない', () => {
    const view = snapshot({ lastVerification: report('run-1', { passed: true }, true), history: [entry('run-1', 'display-only')], appliedDefense: 'display-only' });
    expect(whyDefenseFailed(view)).toBeNull();
  });

  it('実行環境のエラーで判定できないときは一文を返さない', () => {
    const view = snapshot({ lastVerification: report('run-1', { error: '時間切れ' }), history: [entry('run-1', 'display-only')], appliedDefense: 'display-only' });
    expect(whyDefenseFailed(view)).toBeNull();
  });

  it('対策を適用していない検証が不合格なら一文を返さない', () => {
    const view = snapshot({ lastVerification: report('run-1'), history: [entry('run-1', null)], appliedDefense: null });
    expect(whyDefenseFailed(view)).toBeNull();
  });

  it('検証のあと別の対策を適用しても、検証した対策の一文を返す', () => {
    const view = snapshot({ lastVerification: report('run-1'), history: [entry('run-1', 'display-only')], appliedDefense: 'deny-all' });
    expect(whyDefenseFailed(view)).toBe(DISPLAY_ONLY);
  });

  it('同じ runId の履歴が二つあるときは、最後の行の対策の一文を返す', () => {
    const view = snapshot({
      lastVerification: report('run-1'),
      history: [entry('run-1', 'display-only'), entry('run-1', 'deny-all')],
      appliedDefense: 'display-only',
    });
    expect(whyDefenseFailed(view)).toBe(DENY_ALL);
  });

  it('履歴の最後の runId が報告と違うときは一文を返さない', () => {
    const view = snapshot({
      lastVerification: report('run-1'),
      history: [entry('run-1', 'display-only'), entry('run-2', 'deny-all')],
      appliedDefense: 'display-only',
    });
    expect(whyDefenseFailed(view)).toBeNull();
  });

  it('安全な対策の検証が不合格でも一文を返さない', () => {
    const view = snapshot({ lastVerification: report('run-1'), history: [entry('run-1', 'owner-only')], appliedDefense: 'owner-only' });
    expect(whyDefenseFailed(view)).toBeNull();
  });
});
