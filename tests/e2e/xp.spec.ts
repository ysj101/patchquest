// XP の段階報酬・再挑戦・改変した進捗の照合をブラウザで確かめる。XP は演習画面に出さず、記録ページにだけ出す。
import type { Page } from '@playwright/test';
import { TEST_PACK_ANSWERS, answerTransferCheck, applyDefense, backToList, expect, importProgressFile, reproduceNoteLeak, launchButton, openMission, openRawRequest, openRecords, openTestPage, test, ticketSeals, openHome } from './fixtures';

const badge = (page: Page) => page.locator('.records-view .xp-badge');
/** 記録ページを開いて、レベルと XP の表示を確かめる */
async function expectXp(page: Page, text: string): Promise<void> {
  await openRecords(page);
  await expect(badge(page)).toHaveText(text);
}

async function investigate(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '調査' }).click();
  await openRawRequest(page);
  await page.locator('[data-anchor="request-editor"]').getByRole('button', { name: 'このリクエストを送る' }).click();
}

const repair = (page: Page) => applyDefense(page, '所有者を照合する');

async function finish(page: Page): Promise<void> {
  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await answerTransferCheck(page, TEST_PACK_ANSWERS);
}

test('段階ごとの報酬は記録ページに出し、再挑戦は 20 XP だけ加算し、演習画面には XP を出さない', async ({ page }) => {
  await openHome(page);
  await expectXp(page, 'Lv.1 ・ 0 XP');
  await openMission(page, 'test-pack');
  await launchButton(page).click();
  await expect(page.locator('.exercise')).not.toContainText('XP');
  await investigate(page);
  await reproduceNoteLeak(page);
  await repair(page);
  await finish(page);
  await expect(page.locator('.exercise')).not.toContainText('XP');
  await expect(page.locator('[aria-live="polite"]')).not.toContainText('XP');
  await backToList(page).click();
  await expectXp(page, 'Lv.2 ・ 140 XP');
  await openMission(page, 'test-pack');
  await launchButton(page).click();
  await investigate(page);
  await reproduceNoteLeak(page);
  await repair(page);
  await finish(page);
  await backToList(page).click();
  await expectXp(page, 'Lv.2 ・ 160 XP');
});

test('改変したXPは取り込み時に注記し、記録から計算した値を表示する', async ({ page }) => {
  await openTestPage(page, 'progress');
  const source = JSON.parse(await page.evaluate(() => window.progressTest.exportJson())) as { profile: { xp: { total: number } } };
  source.profile.xp = { total: 999 };
  await importProgressFile(page, source, '読み込んだファイルの XP や実績が記録と合わなかったので、記録から計算し直しました');
  await expect(page.locator('[aria-live="polite"]')).toContainText('記録から計算し直しました');
  await expectXp(page, 'Lv.1 ・ 0 XP');
});
