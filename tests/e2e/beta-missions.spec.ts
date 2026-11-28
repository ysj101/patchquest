// ベータ版の課題は、設定で表示を有効にしたときだけ一覧と URL から開けて、一覧では「ベータ版」の札で見分けられることを確かめる。
// テスト用カタログのベータ版は test-beta だけ
import type { Page } from '@playwright/test';
import { expect, openHome, preflightHeading, settingsButton, test } from './fixtures';

const betaRow = (page: Page) => page.locator('[data-mission="test-beta"]');
const rows = (page: Page) => page.getByRole('list', { name: '課題の一覧' }).locator('.mission-row');
const toggle = (page: Page) => page.getByRole('dialog', { name: '設定' }).getByRole('checkbox', { name: 'ベータ版の課題を表示する' });
const notFound = 'URL の課題「test-beta」は見つかりませんでした。課題一覧から選んでください。';

test('設定を変えなければ、ベータ版の課題は一覧に出ず、URL でも開けない', async ({ page }) => {
  await openHome(page);
  await expect(rows(page)).toHaveCount(9);
  await expect(betaRow(page)).toHaveCount(0);
  await expect(page.locator('.beta-label')).toHaveCount(0);
  await settingsButton(page).click();
  await expect(toggle(page)).not.toBeChecked();

  await page.keyboard.press('Escape');

  // 開けなかった URL は課題一覧の URL に置き換わる
  await page.goto('/#/missions/test-beta');
  await expect(page.getByRole('alert')).toHaveText(notFound, { timeout: 15_000 });
  await expect(betaRow(page)).toHaveCount(0);
});

test('設定で表示を有効にすると、すぐ一覧に「ベータ版」の札つきで出て、無効に戻すと消える', async ({ page }) => {
  await openHome(page);
  await settingsButton(page).click();
  await toggle(page).check();
  // 設定を開いたまま、後ろの一覧が描き直される
  await expect(rows(page)).toHaveCount(10);
  await expect(betaRow(page).locator('.beta-label')).toHaveText('ベータ版');
  await expect(toggle(page)).toBeFocused();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  // 札は行の名前に入り、ベータ版でない行には付かない
  await expect(page.getByRole('article', { name: /ベータ版の検証用パック\s*ベータ版$/ })).toBeVisible();
  await expect(page.locator('.beta-label')).toHaveCount(1);

  await page.reload();
  await expect(betaRow(page)).toBeVisible({ timeout: 15_000 });

  await settingsButton(page).click();
  await toggle(page).uncheck();
  await expect(betaRow(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(9);
});

test('表示を有効にすると、ベータ版の課題を一覧と URL から始められる', async ({ page }) => {
  await openHome(page);
  await settingsButton(page).click();
  await toggle(page).check();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await betaRow(page).getByRole('button', { name: 'この課題を始める' }).click();
  await expect(preflightHeading(page)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/missions/test-beta');

  await page.reload();
  await expect(preflightHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('alert').filter({ hasText: '見つかりませんでした' })).toHaveCount(0);
});
