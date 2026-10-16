// XP の段階報酬・再挑戦・改変した進捗の照合をブラウザで確かめる。
import type { Page } from '@playwright/test';
import { expect, enterWorkbench, reproduceNoteLeak, launchButton, openMission, test, ticketSeals, turnMotionOffWithKeyboard, settingsButton } from './fixtures';

const badge = (page: Page) => page.locator('.xp-badge');
const gain = (page: Page, amount: number) => expect(badge(page).locator('.xp-gain')).toHaveText(`+${amount} XP`);

async function investigate(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '調査' }).click();
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
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(ticketSeals(page)).toContainText('理解：達成');
}

test('各段階で報酬を受け取り、再挑戦は20 XPだけ加算し、再開時は演出しない', async ({ page }) => {
  await page.goto('/');
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
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expect(page.locator('.xp-summary')).toHaveText('Lv.2 ・ 140 XP ・ 次のレベルまで 110 XP');
  await openMission(page, 'test-pack', { resume: true });
  await expect(badge(page)).toContainText('140 XP');
  await expect(badge(page).locator('.xp-gain')).toHaveCount(0);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
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
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expect(page.locator('.xp-summary')).toContainText('160 XP');
});

test('改変したXPは取り込み時に注記し、記録から計算した値を表示する', async ({ page }) => {
  await page.goto('/test/progress.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  const source = JSON.parse(await page.evaluate(() => window.progressTest.exportJson())) as { profile: { xp: { total: number } } };
  source.profile.xp = { total: 999 };
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: '進捗.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await expect(page.locator('.banner-warn').filter({ hasText: '取り込んだファイルの XP または実績は、そのファイルの記録と合わなかったため、記録から計算し直しました' })).toBeVisible();
  await expect(page.locator('.xp-summary')).toContainText('Lv.1 ・ 0 XP');
  await expect(page.locator('[aria-live="polite"]')).toContainText('記録から計算し直しました');
});

test('動きオフでも獲得量と読み上げを文字で示す', async ({ page }) => {
  await page.goto('/');
  await settingsButton(page).focus();
  await turnMotionOffWithKeyboard(page);
  await openMission(page, 'test-pack');
  await launchButton(page).click();
  await gain(page, 10);
  await expect(badge(page).locator('.xp-gain')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[aria-live="polite"]')).toContainText('10 XP を獲得（合計 10）');
});
