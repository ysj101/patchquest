// 進捗の保存・復元（Issue #10、A15・A16）
import type { Page } from '@playwright/test';
import { emptyMilestones } from '../../platform/contract';
import { makeAttempt } from '../support/attempt';
import { expect, test } from './fixtures';

const attempt = (id: string) => makeAttempt(id);

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
  expect(JSON.parse(json)).toMatchObject({ schemaVersion: 3, profile: {} });

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

test('v1 の既存 DB を v2 へ更新し、達成印を持つ記録を保つ', async ({ page }) => {
  await page.goto('/test/');
  const legacy = { ...makeAttempt('旧DB', { badges: { reproduction: { achieved: true }, defense: { achieved: false }, understanding: { achieved: false } } }), milestones: undefined };
  await page.evaluate((record) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('patchquest', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('attempts', { keyPath: 'attemptId' }).put(record);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(new Error('旧DB の作成に失敗しました', { cause: request.error }));
  }), legacy);
  await open(page);
  expect(await page.evaluate(() => window.progressTest.reason())).toBeNull();
  const exported = JSON.parse(await page.evaluate(() => window.progressTest.exportJson())) as unknown;
  expect(exported).toMatchObject({ schemaVersion: 3, profile: {}, attempts: [{ ...legacy, milestones: emptyMilestones() }] });
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  expect(await page.evaluate(() => window.progressTest.ids())).toEqual(['旧DB']);
});

test('別タブが旧DBを開いていても起動し、保存領域を更新できない理由を返す', async ({ page, context }) => {
  // このページは v1 の接続を開いたまま保持する（テスト終了時にページごと閉じる）
  await page.goto('/test/');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('patchquest', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('attempts', { keyPath: 'attemptId' });
    };
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('旧DB の作成に失敗しました', { cause: request.error }));
  }));
  const otherPage = await context.newPage();
  await otherPage.goto('/test/');
  await open(otherPage);
  expect(await otherPage.evaluate(() => window.progressTest.reason())).toBe(
    'ブラウザに保存できません（ほかのタブで PatchQuest が開いているため、保存領域を更新できません。ほかのタブを閉じてから再読み込みしてください）',
  );
  await otherPage.evaluate((record) => window.progressTest.save(record), attempt('メモリ継続'));
  expect(await otherPage.evaluate(() => window.progressTest.ids())).toEqual(['メモリ継続']);
});
