// 進捗の保存・復元（Issue #10、A15・A16）
import type { Page } from '@playwright/test';
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

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await open(otherPage);
  await otherPage.evaluate((a) => window.progressTest.save(a), attempt('existing'));
  expect(await otherPage.evaluate(() => window.progressTest.importJson('{"format":"x"}'))).toMatchObject({ ok: false });
  expect(await otherPage.evaluate((text) => window.progressTest.importJson(text), json)).toEqual({ ok: true, imported: 1 });
  expect((await otherPage.evaluate(() => window.progressTest.ids())).sort()).toEqual(['existing', 'exported']);
  await other.close();
});

test('schemaVersion 2 の profile は再読み込み後も IndexedDB に残る', async ({ page }) => {
  await open(page);
  const file = {
    format: 'patchquest-progress',
    schemaVersion: 2,
    exportedAt: '',
    attempts: [attempt('kept')],
    profile: { entries: [{ id: 'stage-reach' }] },
  };
  expect(await page.evaluate((text) => window.progressTest.importJson(text), JSON.stringify(file))).toEqual({ ok: true, imported: 1 });
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  expect(JSON.parse(await page.evaluate(() => window.progressTest.exportJson()))).toMatchObject({
    schemaVersion: 2,
    profile: { entries: [{ id: 'stage-reach' }] },
  });
});

test('attempts だけの IndexedDB を開いても記録が残り、profile は空になる', async ({ page }) => {
  const legacy = attempt('legacy');
  await page.addInitScript(async (record) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('patchquest', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('attempts', { keyPath: 'attemptId' });
      };
      request.onerror = () => reject(request.error ?? new Error('旧形式のデータベースを開けません'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('attempts', 'readwrite');
        transaction.objectStore('attempts').put(record);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('旧形式の記録を書けません'));
      };
    });
  }, legacy);
  await open(page);
  expect(await page.evaluate(() => window.progressTest.ids())).toEqual(['legacy']);
  expect(JSON.parse(await page.evaluate(() => window.progressTest.exportJson()))).toMatchObject({
    schemaVersion: 2,
    profile: { entries: [] },
    attempts: [{ attemptId: 'legacy', badges: legacy.badges }],
  });
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
