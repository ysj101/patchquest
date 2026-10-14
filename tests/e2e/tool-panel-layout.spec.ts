// 学習UI：演習の道具パネルの幅とスクロール（Issue #58）
import type { Page } from '@playwright/test';
import { expect, startMission, test, verifyWith } from './fixtures';

/** 開いているタブの中身が、パネル自身のスクロールや切り取りに隠れていない */
async function expectNoPanelScroll(page: Page): Promise<void> {
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await expect(panel).toBeVisible();
  const hidden = await panel.evaluate((el) => {
    const overflow = getComputedStyle(el).overflowY;
    const tools = el.closest('.tools');
    const clips = tools !== null && tools.scrollHeight > tools.clientHeight + 1;
    return overflow === 'auto' || overflow === 'scroll' || clips;
  });
  expect(hidden).toBe(false);
}

/** 横スクロールが出ていない */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflows).toBe(false);
}

/** 要素の矩形。画面に無いときはそこで止める */
async function box(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const value = await page.locator(selector).boundingBox();
  if (!value) throw new Error(`${selector} が画面にありません`);
  return value;
}

/** 対策タブの適用と検証が、パネル内スクロールなしに画面へ入っている */
async function expectRepairActionsInView(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await expectNoPanelScroll(page);
  await expect(page.getByRole('button', { name: 'この対策を適用する' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '攻撃と普段の使い方を検証する' })).toBeInViewport();
}

test('1280×800 では調査と対策の主要な操作が、パネル内をスクロールせずに見える', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startMission(page, 'idor');
  await expect(page.getByRole('tab', { name: '調査' })).toBeVisible();

  const app = await box(page, '.app-pane');
  const tools = await box(page, '.tools');
  expect(app.width).toBeGreaterThan(400);
  expect(tools.width).toBeGreaterThan(app.width);

  await page.getByRole('tab', { name: '調査' }).click();
  await expectNoPanelScroll(page);
  await expect(page.getByRole('button', { name: '送る', exact: true }).first()).toBeInViewport();
  const editor = await box(page, '[data-anchor="request-editor"] textarea');
  expect(editor.width).toBeGreaterThan(tools.width * 0.8);

  await expectRepairActionsInView(page);
  const columns = await page.locator('.diff-pair').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  const codeWidth = await page.locator('.diff-pair pre').first().evaluate((el) => el.getBoundingClientRect().width);
  expect(codeWidth).toBeGreaterThan(300);
  await expectNoHorizontalOverflow(page);
});

test('1512×900 の練習では、操作ガイドがあっても送る・適用する・検証するが画面に入る', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await startMission(page, 'onboarding');
  await expect(page.getByRole('complementary', { name: '操作ガイド' })).toBeVisible();

  await page.getByRole('tab', { name: '調査' }).click();
  await expectNoPanelScroll(page);
  await expect(page.getByRole('button', { name: '送る', exact: true })).toBeInViewport();

  await expectRepairActionsInView(page);
});

test('振り返りの「回答する」は、ページを送れば届き、パネルの中はスクロールしない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startMission(page, 'idor');
  await verifyWith(page, '取り出す処理で、ログイン中の利用者と所有者を照合する');
  await expect(page.locator('[data-anchor="results"]')).toContainText('防御できました', { timeout: 20_000 });

  await page.getByRole('tab', { name: '振り返り' }).click();
  const answer = page.getByRole('button', { name: '回答する' });
  await expect(answer).toBeVisible();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  expect(await panel.evaluate((el) => el.scrollHeight)).toBeGreaterThan(720);
  await expectNoPanelScroll(page);

  await answer.scrollIntoViewIfNeeded();
  await expect(answer).toBeInViewport();
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
  await expectNoHorizontalOverflow(page);
});

test('960px 以下は教材アプリの下に道具が並び、横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 800 });
  await startMission(page, 'onboarding');
  await expect(page.getByRole('tab', { name: '調査' })).toBeVisible();

  const tracks = await page.locator('.workbench').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(tracks).toBe(1);
  const app = await box(page, '.app-pane');
  const tools = await box(page, '.tools');
  expect(app.y + app.height).toBeLessThanOrEqual(tools.y + 1);
  expect(Math.abs(app.x - tools.x)).toBeLessThan(2);

  await page.getByRole('tab', { name: '対策' }).click();
  await expectNoPanelScroll(page);
  const diffTracks = await page.locator('.diff-pair').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(diffTracks).toBe(1);
  await expect(page.getByRole('button', { name: 'この対策を適用する' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.getByRole('button', { name: '攻撃と普段の使い方を検証する' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoPanelScroll(page);
});
