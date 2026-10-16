// ステージの到達・取り消し・再開・別環境への復元を確かめる。
import type { Page } from '@playwright/test';
import { expect, launchButton, openMission, preview, startMission, test, ticketSeals, verifyWith, openHome } from './fixtures';

const stages = (page: Page) => page.getByRole('list', { name: 'ステージ', exact: true });
const count = (page: Page, total: number) => expect(page.getByRole('heading', { name: `ステージ ${total} / 5`, exact: true })).toBeVisible();

async function apply(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: /取り出す処理で、ログイン中/ }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(stages(page).locator('li').nth(3)).toHaveAttribute('data-state', 'done');
}

test('IDOR の導入から調査・再現・対策・理解確認まで五段階で進む', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'idor');
  await count(page, 0);
  await expect(ticketSeals(page)).toContainText('再現：未達成');
  await launchButton(page).click();
  await count(page, 1);
  await expect(stages(page).locator('li').first()).toContainText('事件を確認済');
  await page.getByRole('tab', { name: '調査' }).click();
  await page.locator('[data-anchor="request-editor"]').getByRole('button', { name: 'このリクエストを送る' }).click();
  await count(page, 2);
  const investigation = stages(page).locator('li').nth(1);
  await expect(investigation).toHaveClass('stage-arrived');
  await expect(page.locator('[aria-live="polite"]')).toContainText('20 XP を獲得（合計 30）');
  await expect(page.locator('[aria-live="polite"]')).toContainText('ステージ 2「手がかりを探す」に到達しました');
  await page.getByRole('radio', { name: /^bob/ }).check();
  await preview(page).getByRole('button', { name: '非公開のメモ' }).click();
  await preview(page).getByRole('button', { name: '← 前のメモ' }).click();
  await preview(page).getByRole('button', { name: '← 前のメモ' }).click();
  await count(page, 3);
  await apply(page);
  await count(page, 4);
  await expect(ticketSeals(page)).toContainText('防御：未達成');
  await page.getByRole('button', { name: '対策を取り消す' }).click();
  await count(page, 4);
  await verifyWith(page, '取り出す処理で、ログイン中の利用者と所有者を照合する');
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await count(page, 4);
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: /^請求書を取り出す処理が/ }).check();
  await page.getByRole('radio', { name: /^編集する処理で、セッション/ }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await count(page, 5);
});

test('到達記録は再開・再読み込み・別環境への取り込みで保ち、再挑戦は導入を既定で飛ばす', async ({ page, browser }) => {
  await startMission(page, 'idor');
  await apply(page);
  const before = await stages(page).allTextContents();
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await openMission(page, 'idor', { resume: true });
  await expect(stages(page)).toHaveText(before);
  await expect(stages(page).locator('.stage-arrived')).toHaveCount(0);
  await page.reload();
  await openMission(page, 'idor', { resume: true });
  await expect(stages(page)).toHaveText(before);
  await page.goto('/test/progress.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  const json = await page.evaluate(() => window.progressTest.exportJson());
  const other = await browser.newContext();
  try {
    const restored = await other.newPage();
    await restored.goto('/test/progress.html');
    await expect(restored.locator('body[data-ready="true"]')).toBeAttached();
    expect(await restored.evaluate((text) => window.progressTest.importJson(text), json)).toEqual({ ok: true, imported: 1, profileRecomputed: false });
    await restored.goto('/');
    await openMission(restored, 'idor', { resume: true });
    await expect(stages(restored)).toHaveText(before);
    await expect(stages(restored).locator('.stage-arrived')).toHaveCount(0);
  } finally {
    await other.close();
  }
  await openHome(page);
  await openMission(page, 'idor');
  await count(page, 1);
  await expect(launchButton(page)).toBeHidden();
});

test('動きを減らしても到達と現在地を文字で示し、導入の読み直しでは再通知しない', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startMission(page, 'idor');
  const first = stages(page).locator('li').first();
  await expect(first).toHaveCSS('animation-name', 'none');
  await expect(stages(page).locator('li').nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(stages(page).locator('li').nth(1)).toContainText('いま');
  await expect(page.locator('[aria-live="polite"]')).toContainText('ステージ 1「事件を確認」に到達しました');
  await page.locator('[aria-live="polite"]').evaluate((region) => { region.textContent = ''; });
  await page.getByRole('button', { name: '導入をもう一度見る' }).click();
  await launchButton(page).click();
  await count(page, 1);
  await expect(page.locator('[aria-live="polite"]')).toBeEmpty();
});

test('教材アプリでメモを開くだけで手がかりを探すステージに到達する', async ({ page }) => {
  await startMission(page, 'idor');
  const app = preview(page);
  await expect(app.getByRole('button', { name: '非公開のメモ' })).toBeVisible();
  await count(page, 1);
  await app.getByRole('button', { name: '非公開のメモ' }).click();
  await expect(stages(page).locator('li').nth(1)).toHaveAttribute('data-state', 'done');
  await count(page, 2);
});
