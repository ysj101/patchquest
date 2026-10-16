// Evaluator を実ブラウザの検証インスタンスで動かす（Issue #8）
import type { Page } from '@playwright/test';
import { memoApp } from '../../apps/memo';
import type { TestCase, TestOutcome } from '../../platform/contract';
import type { EvaluationSubject, EvaluatorLimits } from '../../platform/evaluator/evaluator';
import { expect, test } from './fixtures';

const notes = (implementations: Record<string, string> = {}): EvaluationSubject => ({
  attemptId: 'attempt-e2e',
  app: { id: 'test-app', version: '1.0.0' },
  fixture: { generator: 'test.default', seed: 21 },
  implementations,
});

/** 製品と同じ上限で実行する。limits は終わらないテストの確認で短い上限を渡すためだけに使う */
async function runSuite(page: Page, subject: EvaluationSubject, tests: TestCase[] | 'memo' | 'pack', target: string[] = [], limits: Partial<EvaluatorLimits> = {}) {
  // TestCase は再帰的な型のため、引数は JSON 文字列で渡す
  const result = await page.evaluate((json) => {
    const a = JSON.parse(json) as { subject: EvaluationSubject; tests: TestCase[] | 'memo' | 'pack'; target: string[]; limits: Partial<EvaluatorLimits> };
    const list = a.tests === 'memo' ? window.evaluatorTest.memoTests : a.tests === 'pack' ? window.evaluatorTest.packCases : a.tests;
    return window.evaluatorTest.runSuite(a.subject, list, a.target, 'run-e2e', a.limits);
  }, JSON.stringify({ subject, tests, target, limits }));
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const failed = (outcomes: TestOutcome[]) => outcomes.filter((o) => !o.passed);

test.beforeEach(async ({ page }) => {
  await page.goto('/test/evaluator.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('基準のメモアプリは全テストに合格する（A01）', async ({ page }) => {
  const report = await runSuite(page, { attemptId: 'memo', app: { id: 'memo', version: memoApp.descriptor.version }, fixture: { generator: 'memo.default', seed: 31 }, implementations: {} }, 'memo');
  expect(failed(report.outcomes)).toEqual([]);
  expect(report.passed).toBe(true);
  // 検証は演習用とは別の、非表示のプレビューで行う
  expect(await page.evaluate(() => window.evaluatorTest.frames())).toEqual([{ hidden: true, sandbox: 'allow-scripts' }]);
});

test('描画の手順は実 DOM の実行マーカーで判定する', async ({ page }) => {
  const target = ['test.render-no-script'];
  expect(failed((await runSuite(page, notes(), 'pack', target)).outcomes)).toEqual([]);

  const unsafe = await runSuite(page, notes({ 'note.render': 'test-pack/html' }), 'pack', target);
  expect(failed(unsafe.outcomes)).toEqual([
    expect.objectContaining({ testId: 'test.render-no-script', group: 'attack', actual: '観測イベント dom.marker が発生した' }),
  ]);
});

test('時間内に終わらないテストは基盤エラーとして不合格にし、残りのテストは続ける', async ({ page }) => {
  const slow: TestCase = { id: 'slow', category: 'normal', title: '終わらない', steps: [{ kind: 'request', as: 'alice', request: { method: 'GET', path: '/slow' } }] };
  const own: TestCase = { id: 'own', category: 'normal', title: '自分のノート', steps: [{ kind: 'request', as: 'alice', request: { method: 'GET', path: '/notes' }, expect: { status: 200 } }] };
  // 終わらない要求を待つ時間だけ短くする。通常のテストは製品と同じ 5 秒で動かす
  const report = await runSuite(page, notes(), [slow, own], [], { testTimeoutMs: 1000 });
  expect(report.outcomes).toEqual([
    expect.objectContaining({ testId: 'slow', passed: false, error: 'timeout', actual: 'テストが 1 秒以内に終わりませんでした' }),
    expect.objectContaining({ testId: 'own', passed: true }),
  ]);
  expect(report.passed).toBe(false);
});
