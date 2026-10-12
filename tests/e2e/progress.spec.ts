// 進捗の保存・復元（Issue #10、A15・A16）
import type { Page } from '@playwright/test';
import type { AttemptRecord } from '../../platform/contract';
import { expect, test } from './fixtures';

const attempt = (id: string): AttemptRecord => ({
  attemptId: id,
  missionId: 'test-pack',
  missionVersion: '1.0.0',
  variantId: 'default',
  recipeId: 'any-owner',
  recipeVersion: '1.0.0',
  appId: 'test-app',
  appVersion: '1.0.0',
  seed: 1,
  fixtureHash: 'f',
  createdAt: '2026-10-12T00:00:00Z',
  state: 'Prepared',
  configHash: 'c',
  appliedDefense: null,
  badges: { reproduction: { achieved: false }, defense: { achieved: false }, understanding: { achieved: false } },
  lastVerification: null,
  hintsOpened: [],
  solutionViewed: false,
  answers: {},
});

async function open(page: Page) {
  await page.goto('/test/progress.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
}

test('IndexedDB に保存した進捗は再読み込み後も残り、削除できる', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => window.progressTest.reason())).toBeNull();
  await page.evaluate((a) => window.progressTest.save(a), attempt('persisted'));
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  expect(await page.evaluate(() => window.progressTest.ids())).toEqual(['persisted']);

  await page.evaluate(() => window.progressTest.clear());
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  expect(await page.evaluate(() => window.progressTest.ids())).toEqual([]);
});

test('書き出した JSON を別のブラウザ環境へ復元でき、不正な JSON では既存の進捗を失わない', async ({ page, browser }) => {
  await open(page);
  await page.evaluate((a) => window.progressTest.save(a), attempt('exported'));
  const json = await page.evaluate(() => window.progressTest.exportJson());

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await open(otherPage);
  await otherPage.evaluate((a) => window.progressTest.save(a), attempt('existing'));
  expect(await otherPage.evaluate(() => window.progressTest.importJson('{"format":"x"}'))).toMatchObject({ ok: false });
  expect(await otherPage.evaluate((text) => window.progressTest.importJson(text), json)).toEqual({ ok: true, imported: 1 });
  expect((await otherPage.evaluate(() => window.progressTest.ids())).sort()).toEqual(['existing', 'exported']);
  await other.close();
});

test('IndexedDB を使えない環境では理由を返し、メモリで続ける', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('blocked for test', 'SecurityError');
      },
    });
  });
  await open(page);
  expect(await page.evaluate(() => window.progressTest.reason())).toMatch(/ブラウザに保存できません/);
  await page.evaluate((a) => window.progressTest.save(a), attempt('memory'));
  expect(await page.evaluate(() => window.progressTest.ids())).toEqual(['memory']);
  expect(JSON.parse(await page.evaluate(() => window.progressTest.exportJson())).attempts).toHaveLength(1);
});
