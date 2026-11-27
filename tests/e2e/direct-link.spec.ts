// 課題へ直接入る URL（#/missions/<課題ID>）と、アドレス欄・戻る・進むが画面と揃うことを確かめる
import type { Page } from '@playwright/test';
import { enterWorkbench, expect, openHome, openRecords, test } from './fixtures';

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });
const testPack = (page: Page) => page.locator('[data-mission="test-pack"]');
const hashOf = (page: Page) => new URL(page.url()).hash;

test('課題の URL を開くと、その課題が始まる', async ({ page }) => {
  await page.goto('/#/missions/test-pack');
  await enterWorkbench(page);
  expect(hashOf(page)).toBe('#/missions/test-pack');
});

test('途中の記録がある課題の URL を開くと、続きから始まる', async ({ page }) => {
  await page.goto('/#/missions/test-pack');
  await enterWorkbench(page);
  const ticket = await page.locator('.ticket-id').textContent();
  if (!ticket) throw new Error('演習票がありません');
  // 記録の保存は一覧へ戻るときに待つので、一覧を経てから読み込み直す
  await page.getByRole('button', { name: 'PatchQuest（課題一覧へ戻る）' }).click();
  await expect(testPack(page).getByRole('button', { name: '続きから始める' })).toBeVisible();

  await page.goto('/#/missions/test-pack');
  await page.reload();
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).toHaveText(ticket);
});

test('画面を移るとアドレス欄が変わり、戻る・進むで同じ画面に戻れる', async ({ page }) => {
  await openHome(page);
  expect(hashOf(page)).toBe('');

  await testPack(page).getByRole('button', { name: 'この課題を始める' }).click();
  await enterWorkbench(page);
  expect(hashOf(page)).toBe('#/missions/test-pack');

  await page.goBack();
  await expect(heading(page, 'PatchQuest')).toBeVisible();
  await page.goForward();
  await enterWorkbench(page);

  await openRecords(page);
  expect(hashOf(page)).toBe('#/records');
  await page.reload();
  await expect(heading(page, '記録')).toBeVisible({ timeout: 15_000 });
});

test('演習中に「本文へ移動」を使っても、演習は続く', async ({ page }) => {
  await page.goto('/#/missions/test-pack');
  await enterWorkbench(page);
  const ticket = await page.locator('.ticket-id').textContent();
  await page.getByRole('link', { name: '本文へ移動' }).focus();
  await page.keyboard.press('Enter');
  // 押した直後は URL がまだ変わっていないことがあるので、変わるまで待つ
  await expect.poll(() => hashOf(page)).toBe('#main');
  await page.goBack();
  await expect.poll(() => hashOf(page)).toBe('#/missions/test-pack');
  await expect(page.locator('.exercise')).toBeVisible();
  await expect(page.locator('.ticket-id')).toHaveText(ticket ?? '');
});

test('ない課題の URL は、理由を添えて課題一覧を出す', async ({ page }) => {
  await page.goto('/#/missions/no-such-mission');
  await expect(heading(page, 'PatchQuest')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('alert')).toHaveText('URL の課題「no-such-mission」は見つかりませんでした。課題一覧から選んでください。');
  expect(hashOf(page)).toBe('#/');
});
