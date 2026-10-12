// Evaluator を実ブラウザの検証インスタンスで動かす（Issue #8）
import type { Page } from '@playwright/test';
import type { TestCase, TestOutcome } from '../../platform/contract';
import type { EvaluationSubject } from '../../platform/evaluator/evaluator';
import { expect, test } from './fixtures';

const notes = (implementations: Record<string, string> = {}): EvaluationSubject => ({
  attemptId: 'attempt-e2e',
  app: { id: 'test-app', version: '1.0.0' },
  fixture: { generator: 'test.default', seed: 21 },
  implementations,
});

async function runSuite(page: Page, subject: EvaluationSubject, tests: TestCase[] | 'memo' | 'pack', target: string[] = []) {
  // TestCase は再帰的な型のため、引数は JSON 文字列で渡す
  const result = await page.evaluate((json) => {
    const a = JSON.parse(json) as { subject: EvaluationSubject; tests: TestCase[] | 'memo' | 'pack'; target: string[] };
    const list = a.tests === 'memo' ? window.evaluatorTest.memoTests : a.tests === 'pack' ? window.evaluatorTest.packCases : a.tests;
    return window.evaluatorTest.runSuite(a.subject, list, a.target, 'run-e2e');
  }, JSON.stringify({ subject, tests, target }));
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const failed = (outcomes: TestOutcome[]) => outcomes.filter((o) => !o.passed);

test.beforeEach(async ({ page }) => {
  await page.goto('/test/evaluator.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('基準のメモアプリは全テストに合格する（A01）', async ({ page }) => {
  const report = await runSuite(page, { attemptId: 'memo', app: { id: 'memo', version: '1.1.0' }, fixture: { generator: 'memo.default', seed: 31 }, implementations: {} }, 'memo');
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
  const report = await runSuite(page, notes(), [slow, own]);
  expect(report.outcomes).toEqual([
    expect.objectContaining({ testId: 'slow', passed: false, error: 'timeout' }),
    expect.objectContaining({ testId: 'own', passed: true }),
  ]);
  expect(report.passed).toBe(false);
});
