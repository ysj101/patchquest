// XP の段階報酬・再挑戦・改変した進捗の照合をブラウザで確かめる。
import type { Page } from '@playwright/test';
import { TEST_PACK_ANSWERS, answerTransferCheck, backToList, expect, enterWorkbench, importProgressFile, reproduceNoteLeak, launchButton, openMission, openMissions, openRawRequest, test, ticketSeals, turnMotionOffWithKeyboard, settingsButton, openHome } from './fixtures';

const badge = (page: Page) => page.locator('.xp-badge');
const gain = (page: Page, amount: number) => expect(badge(page).locator('.xp-gain')).toHaveText(`+${amount} XP`);

async function investigate(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '調査' }).click();
  await openRawRequest(page);
  await page.locator('[data-anchor="request-editor"]').getByRole('button', { name: 'このリクエストを送る' }).click();
}

async function repair(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: /所有者を照合する/ }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(page.getByText('適用中の対策：所有者を照合する')).toBeVisible();
}

async function finish(page: Page): Promise<void> {
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await answerTransferCheck(page, TEST_PACK_ANSWERS);
}

test('各段階で報酬を受け取り、再挑戦は20 XPだけ加算し、再開時は演出しない', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'test-pack');
  await expect(badge(page)).toContainText('Lv.1 ・ 0 XP');
  await launchButton(page).click();
  await gain(page, 10);
  await investigate(page);
  await gain(page, 20);
  await reproduceNoteLeak(page);
  await gain(page, 30);
  await repair(page);
  await gain(page, 30);
  await finish(page);
  await gain(page, 50);
  await expect(badge(page)).toContainText('Lv.2 ・ 140 XP');
  await backToList(page).click();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await openMission(page, 'test-pack', { resume: true });
  await expect(badge(page)).toContainText('140 XP');
  await expect(badge(page).locator('.xp-gain')).toHaveCount(0);
  await backToList(page).click();
  await openMission(page, 'test-pack');
  await investigate(page);
  await reproduceNoteLeak(page);
  await repair(page);
  await expect(badge(page).locator('.xp-gain')).toHaveCount(0);
  await finish(page);
  await gain(page, 20);
  await expect(badge(page)).toContainText('Lv.2 ・ 160 XP');
  await page.getByRole('button', { name: '新しいデータで再挑戦する' }).click();
  await enterWorkbench(page);
  await expect(badge(page)).toContainText('Lv.2 ・ 160 XP');
  await expect(badge(page).locator('.xp-gain')).toHaveCount(0);
  await backToList(page).click();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
});

test('改変したXPは取り込み時に注記し、記録から計算した値を表示する', async ({ page }) => {
  await page.goto('/test/progress.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  const source = JSON.parse(await page.evaluate(() => window.progressTest.exportJson())) as { profile: { xp: { total: number } } };
  source.profile.xp = { total: 999 };
  await importProgressFile(page, source, '取り込んだファイルの XP または実績は、そのファイルの記録と合わなかったため、記録から計算し直しました');
  await openMissions(page);
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-live="polite"]')).toContainText('記録から計算し直しました');
  await openMission(page, 'test-pack');
  await expect(badge(page)).toContainText('Lv.1 ・ 0 XP');
});

test('動きオフでも獲得量と読み上げを文字で示す', async ({ page }) => {
  await openHome(page);
  await settingsButton(page).focus();
  await turnMotionOffWithKeyboard(page);
  await openMission(page, 'test-pack');
  await launchButton(page).click();
  await gain(page, 10);
  await expect(badge(page).locator('.xp-gain')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[aria-live="polite"]')).toContainText('10 XP を獲得（合計 10）');
});
