// 分類ごとの習熟度が一覧と記録ページに★と文字で出て（演習画面には出さない）、達成印に応じて変わり、根拠を開けることをブラウザで確かめる。
import type { Page } from '@playwright/test';
import { backToList, expect, launchButton, openHome, openMission, openRecords, reproduceNoteLeak, test, ticketSeals, verifyWith } from './fixtures';

const listSection = (page: Page) => page.getByRole('region', { name: '習熟度', exact: true });
const authorization = (page: Page) => listSection(page).locator('.mastery-line[data-category="authorization"]');

test('達成印に応じて持ち主の確認の習熟度が★と文字で上がり、根拠に演習と達成の種類を示す', async ({ page }) => {
  await openHome(page);
  // 課題の行の習熟度は完了した課題にだけ出す。未着手と練習課題には出さない。分類ごとの一覧は記録ページにある
  await expect(page.locator('[data-mission="test-pack"] .mastery-line')).toHaveCount(0);
  await expect(page.locator('[data-mission="onboarding"] .mastery-line')).toHaveCount(0);
  await openRecords(page);
  await expect(authorization(page)).toHaveText('持ち主の確認の習熟度☆☆☆☆☆Lv0：未着手');

  await openMission(page, 'test-pack');
  await launchButton(page).click();
  await page.getByRole('tab', { name: '調査' }).click();
  await reproduceNoteLeak(page);
  await backToList(page).click();
  await openRecords(page);
  await expect(authorization(page)).toContainText('Lv1：再現まで');
  await openMission(page, 'test-pack', { resume: true });
  await verifyWith(page, '所有者を照合する');
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await page.getByRole('tab', { name: '振り返り' }).click();
  // 習熟度は演習画面に出さない
  await expect(page.locator('.exercise .mastery-line')).toHaveCount(0);
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '答える' }).click();
  await expect(ticketSeals(page)).toContainText('理解：達成');

  await backToList(page).click();
  // 完了した課題の行には、その分類の習熟度が付く
  await expect(page.locator('[data-mission="test-pack"] .mastery-line')).toHaveAttribute('data-stars', '3');
  await openRecords(page);
  await expect(authorization(page)).toHaveText('持ち主の確認の習熟度★★★☆☆Lv3：理解まで');
  const evidence = listSection(page).locator('li').filter({ has: page.locator('.mastery-line[data-category="authorization"]') }).locator('.mastery-evidence');
  await evidence.locator('summary').click();
  await expect(evidence.locator('.mastery-evidence-list li')).toHaveText([/^★1：再現のスタンプ（課題 test-pack/, /^★2：防御のスタンプ/, /^★3：再現・防御・理解がそろった/]);
});
