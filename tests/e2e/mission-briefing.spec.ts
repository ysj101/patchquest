// ミッション導入の初回表示・読み直し・保存済み記録によるスキップを確かめる
import type { Page } from '@playwright/test';
import { expect, expectWorkbench, launchButton, openMission, test, openHome } from './fixtures';

const briefing = (page: Page) => page.locator('[data-anchor="briefing"]');

test('初回の事件と依頼、注意書きと演習票を表示し、Escで閉じて同じiframeのまま読み直せる', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'idor');
  await expect(page.getByRole('heading', { name: 'セキュリティ警報', exact: true })).toBeVisible();
  await expect(launchButton(page)).toBeFocused();
  await expect(briefing(page)).toContainText('知らない人の非公開メモが表示されました');
  await expect(briefing(page)).toContainText('非公開メモは、書いた本人（所有者）だけが読めるようにします。');
  await expect(page.locator('.banner-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: '課題一覧へ戻る' })).toBeVisible();
  await expect(page.locator('.ticket')).toContainText('非公開メモを守る');
  await expect(page.locator('.workbench')).toBeHidden();
  // 導入中にも教材アプリを読み込み、読み直しても同じDOMを保つ
  const frame = page.locator('.preview-slot iframe');
  await expect(frame).toHaveCount(1);
  const original = await frame.elementHandle();
  const incident = await briefing(page).locator('.incident').innerText();
  const goal = await briefing(page).locator('.briefing-goal').innerText();
  await expect(briefing(page)).not.toContainText('守るもの');
  await page.keyboard.press('Escape');
  await expectWorkbench(page);
  await expect(page.getByRole('tabpanel', { name: '状況' })).toContainText(incident);
  await expect(page.getByRole('tabpanel', { name: '状況' })).toContainText(goal);
  await page.getByRole('button', { name: '導入をもう一度見る' }).click();
  await expect(briefing(page)).toBeVisible();
  await expect(launchButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectWorkbench(page);
  expect(await frame.evaluate((element, previous) => element === previous, original)).toBe(true);
});

test('同じ課題の再挑戦と続きからの開始では導入を飛ばし、別の課題では表示する', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'idor');
  await launchButton(page).click();
  for (const resume of [false, true]) {
    await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
    await openMission(page, 'idor', { resume });
    await expectWorkbench(page);
  }
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await openMission(page, 'sqli');
  await expect(briefing(page)).toBeVisible();
});

for (const missionId of ['idor', 'sqli', 'stored-xss', 'onboarding']) {
  test(`${missionId}の導入は動きを減らしてもすぐ読めてスキップできる`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHome(page);
    await openMission(page, missionId);
    await expect(briefing(page).locator('.incident')).not.toBeEmpty();
    await expect(briefing(page).locator('.briefing-goal')).not.toBeEmpty();
    await expect(launchButton(page)).toBeFocused();
    await launchButton(page).click();
    await expectWorkbench(page);
  });
}

test('練習課題の既定スキップでは導入のステップも済みになり、読み直してもガイドは進まない', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'onboarding');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await openMission(page, 'onboarding');
  await expectWorkbench(page);
  const guide = page.getByRole('complementary', { name: '操作ガイド' });
  await expect(guide.locator('.guide-count')).toHaveText('3 / 6');
  await expect(guide.getByRole('list', { name: '練習の手順' })).toContainText('何が起きたか読んでみよう：済み');
  await page.getByRole('button', { name: '導入をもう一度見る' }).click();
  await page.keyboard.press('Escape');
  await expectWorkbench(page);
  await expect(guide.locator('.guide-count')).toHaveText('3 / 6');
});

test('ブラウザに保存できない場合は同じ課題でも毎回導入を表示する', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await openHome(page);
  for (let round = 0; round < 2; round++) {
    await openMission(page, 'onboarding');
    await expect(briefing(page)).toBeVisible();
    await launchButton(page).click();
    await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  }
});
