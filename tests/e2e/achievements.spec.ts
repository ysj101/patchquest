// 実績の解除通知・称号・履歴による条件と進捗の照合をブラウザで確かめる。
import type { Page } from '@playwright/test';
import { backToList, expect, importProgressFile, openMission, openRecords, reproduceNoteLeak, startMission, test, ticketSeals, verifyWith, turnMotionOffWithKeyboard, settingsButton, openHome } from './fixtures';

const section = (page: Page) => page.getByRole('region', { name: '実績', exact: true });
const item = (page: Page, id: string) => section(page).locator(`[data-achievement="${id}"]`);
const toast = (page: Page) => page.locator('.achievement-toast');

async function defended(page: Page): Promise<void> {
  await verifyWith(page, '所有者を照合する');
  await expect(ticketSeals(page)).toContainText('防御：達成');
}

/** 課題一覧へ戻り、実績のある記録ページを開く */
async function back(page: Page): Promise<void> {
  await backToList(page).click();
  await openRecords(page);
  await expect(section(page)).toBeVisible();
}

test('ヒントなしで完走すると五つの実績を日時付きで表示し、再開しても通知を繰り返さない', async ({ page }) => {
  await startMission(page, 'test-pack');
  await page.getByRole('tab', { name: '調査' }).click();
  await reproduceNoteLeak(page);
  await expect(toast(page)).toContainText('実績解除：初めて再現');
  await defended(page);
  for (const name of ['初めて防御', 'ヒントなしで防御', '正常な利用を壊さず防御', '一度の検証で防御']) {
    await expect(toast(page)).toContainText(`実績解除：${name}`);
  }
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(ticketSeals(page)).toContainText('理解：達成');
  await back(page);
  await expect(section(page)).toContainText('称号：修理担当（実績 5 / 6）');
  for (const id of ['first-reproduction', 'first-defense', 'no-hint-defense', 'clean-repair', 'first-try']) {
    await expect(item(page, id)).toContainText('解除済み');
    await expect(item(page, id).locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
  }
  await expect(item(page, 'all-missions')).toContainText('未解除');
  const at = await item(page, 'clean-repair').locator('time').textContent();
  await openMission(page, 'test-pack', { resume: true });
  await expect(toast(page)).toBeEmpty();
  await defended(page);
  await expect(toast(page)).toBeEmpty();
  await back(page);
  if (!at) throw new Error('解除日時がありません');
  await expect(item(page, 'clean-repair').locator('time')).toHaveText(at);
});

test('正常系を壊す検証の後で防御しても正常利用と一度の検証の実績は付かない', async ({ page }) => {
  await startMission(page, 'test-pack');
  await verifyWith(page, 'すべて拒否する');
  await expect(ticketSeals(page)).toContainText('防御：未達成');
  await expect(page.getByRole('button', { name: '攻撃と普段の使い方を検証する' })).toBeEnabled();
  await defended(page);
  await back(page);
  await expect(item(page, 'clean-repair')).toContainText('未解除');
  await expect(item(page, 'first-try')).toContainText('未解除');
  await expect(item(page, 'first-defense')).toContainText('解除済み');
});

test('ヒント閲覧後はヒントなし実績を付けず、動きオフでも解除を文字と読み上げで伝える', async ({ page }) => {
  await openHome(page);
  await settingsButton(page).focus();
  await turnMotionOffWithKeyboard(page);
  await openMission(page, 'test-pack');
  await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();
  await page.getByRole('button', { name: 'ヒント 1（着眼点）を見る' }).click();
  await defended(page);
  await expect(toast(page)).toContainText('実績解除：初めて防御');
  await expect(toast(page).locator('.achievement-gain').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[aria-live="polite"]')).toContainText('実績解除：初めて防御');
  await expect(page.locator('[aria-live="polite"]')).toContainText('防御できました');
  await expect(toast(page)).toBeEmpty({ timeout: 5000 });
  await back(page);
  await expect(item(page, 'no-hint-defense')).toContainText('未解除');
});

test('存在しない解除を取り込むと注記し、記録から再判定した実績を表示する', async ({ page }) => {
  await page.goto('/test/progress.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  const source = JSON.parse(await page.evaluate(() => window.progressTest.exportJson())) as { profile: { achievements: Record<string, string> } };
  source.profile.achievements = { 'first-defense': '2026-10-12T00:00:00Z' };
  await importProgressFile(page, source, '記録から計算し直しました');
  await openRecords(page);
  await expect(item(page, 'first-defense')).toContainText('未解除');
  await expect(section(page)).toContainText('称号：新人（実績 0 / 6）');
});


test('防御後にヒントと解法を開いてもヒントなし実績と解除日時が一覧に残る', async ({ page }) => {
  await startMission(page, 'test-pack');
  await defended(page);
  await back(page);
  const unlocked = item(page, 'no-hint-defense');
  await expect(unlocked).toContainText('解除済み');
  const at = await unlocked.locator('time').textContent();
  if (!at) throw new Error('解除日時がありません');
  await openMission(page, 'test-pack', { resume: true });
  await page.getByRole('button', { name: 'ヒント 1（着眼点）を見る' }).click();
  await page.getByRole('button', { name: 'ヒント 2（調査方法）を見る' }).click();
  await page.getByRole('button', { name: 'ヒント 3（修正方針）を見る' }).click();
  await page.getByRole('button', { name: '解法を見る', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '解法を見る', exact: true }).click();
  await back(page);
  await expect(item(page, 'no-hint-defense')).toContainText('解除済み');
  await expect(item(page, 'no-hint-defense').locator('time')).toHaveText(at);
});
