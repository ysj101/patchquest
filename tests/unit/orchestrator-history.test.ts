// 修正前の再実測と、検証ごとに保持する改善履歴を確かめる。
import { expect, it, vi } from 'vitest';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { EngineRuntime } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

function setup() {
  const evaluator = new Evaluator(() => new EngineRuntime());
  const orchestrator = new Orchestrator({ evaluator, exercise: new EngineRuntime(), apps: [testApp], packs: [nodePack] });
  return { evaluator, orchestrator };
}

it('検証ごとに対策と件数を記録し、取り消し・リセット・再開でも保持する', async () => {
  const { orchestrator } = setup();
  const snapshot = await orchestrator.start('test-pack');
  expect(snapshot.vulnerableVerification?.outcomes.filter((outcome) => outcome.group === 'attack').map((outcome) => outcome.passed)).toEqual([false]);
  expect(snapshot.attempt.history).toEqual([]);
  await orchestrator.applyDefense('display-only');
  const insufficient = await orchestrator.verify();
  expect(snapshot.attempt.history[0]).toMatchObject({ runId: insufficient?.runId, defenseId: 'display-only', passed: false, groups: { attack: { passed: 0, total: 1 } } });
  await orchestrator.applyDefense(null);
  await orchestrator.verify();
  expect(snapshot.attempt.history[1]?.defenseId).toBeNull();
  await orchestrator.resetToInitial();
  expect(snapshot.attempt.history).toHaveLength(2);
  const saved = structuredClone(snapshot.attempt);
  const resumed = await orchestrator.start('test-pack', { resume: saved });
  expect(resumed.attempt.history).toEqual(saved.history);
  expect(resumed.attempt.history).not.toBe(saved.history);
  expect(resumed.vulnerableVerification).not.toBe(snapshot.vulnerableVerification);
  expect(resumed.attempt).not.toHaveProperty('vulnerableVerification');
});

it('履歴は最新100件に制限し、報告が得られない基盤エラーは追加しない', async () => {
  const { evaluator, orchestrator } = setup();
  const snapshot = await orchestrator.start('test-pack');
  await orchestrator.applyDefense('owner-only');
  await orchestrator.verify();
  const entry = snapshot.attempt.history[0];
  if (!entry) throw new Error('履歴がありません');
  snapshot.attempt.history = Array.from({ length: 100 }, (_, index) => ({ ...entry, runId: `履歴${index}` }));
  await orchestrator.verify();
  expect(snapshot.attempt.history).toHaveLength(100);
  expect(snapshot.attempt.history[0]?.runId).toBe('履歴1');
  vi.spyOn(evaluator, 'runSuite').mockRejectedValueOnce(new Error('基盤停止'));
  await orchestrator.verify();
  expect(snapshot.attempt.history).toHaveLength(100);
  expect(snapshot.platformError).toBe('基盤停止');
});

it('注入後の判定不能は基盤エラーで止まり、再試行の開始時に修正前を消す', async () => {
  const { evaluator, orchestrator } = setup();
  const snapshot = await orchestrator.start('test-pack');
  const report = snapshot.vulnerableVerification;
  if (!report) throw new Error('修正前の結果がありません');
  const original = evaluator.runSuite.bind(evaluator);
  vi.spyOn(evaluator, 'runSuite').mockImplementation(async (...args) => {
    const result = await original(...args);
    if (args[2].length) result.outcomes[0] = { testId: '基盤', title: '基盤テスト', group: 'attack', passed: false, error: '時間切れ', expected: '', actual: '' };
    return result;
  });
  // Prepared からのリトライは許可しない。新しい演習で再実測を失敗させる。
  const failed = await orchestrator.start('test-pack');
  expect(failed.blocked).toMatchObject({ kind: 'platform-error' });
  expect(failed.vulnerableVerification).toBeNull();
  failed.vulnerableVerification = report;
  await orchestrator.retryPreflight();
  expect(failed.vulnerableVerification).toBeNull();
});

it('判定不能の報告を履歴に記録し、その件数を合否の分母から除く', async () => {
  const { evaluator, orchestrator } = setup();
  const snapshot = await orchestrator.start('test-pack');
  await orchestrator.applyDefense('owner-only');
  const original = evaluator.runSuite.bind(evaluator);
  vi.spyOn(evaluator, 'runSuite').mockImplementationOnce(async (...args) => {
    const report = await original(...args);
    report.outcomes[0] = { testId: '基盤', title: '基盤テスト', group: 'normal', passed: false, error: '時間切れ', expected: '', actual: '' };
    return { ...report, passed: false };
  });
  await orchestrator.verify();
  expect(snapshot.attempt.history[0]).toMatchObject({ passed: false, undetermined: 1, groups: { normal: { passed: 0, total: 0 } } });
});
