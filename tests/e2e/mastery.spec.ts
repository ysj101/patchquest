// 分類ごとの習熟度が一覧と振り返りに★と文字で出て、達成印に応じて変わり、根拠を開けることをブラウザで確かめる。
import type { Page } from '@playwright/test';
import { backToList, expect, openHome, openMission, openRecords, reproduceNoteLeak, test, ticketSeals, verifyWith } from './fixtures';

const listSection = (page: Page) => page.getByRole('region', { name: '習熟度', exact: true });
const authorization = (page: Page) => listSection(page).locator('.mastery-line[data-category="authorization"]');

test('達成印に応じて認可の習熟度が★と文字で上がり、根拠に演習と達成の種類を示す', async ({ page }) => {
  await openHome(page);
  // 課題の行の習熟度は完了した課題にだけ出す。未着手と練習課題には出さない。分類ごとの一覧は記録ページにある
  await expect(page.locator('[data-mission="test-pack"] .mastery-line')).toHaveCount(0);
  await expect(page.locator('[data-mission="onboarding"] .mastery-line')).toHaveCount(0);
  await openRecords(page);
  await expect(authorization(page)).toHaveText('認可の習熟度☆☆☆☆☆Lv0：未着手');

  await openMission(page, 'test-pack');
  await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();
  await page.getByRole('tab', { name: '調査' }).click();
  await reproduceNoteLeak(page);
  await page.getByRole('tab', { name: '振り返り' }).click();
  const debrief = page.locator('.debrief .mastery-line');
  await expect(debrief).toContainText('Lv1：再現まで');
  await verifyWith(page, '所有者を照合する');
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(debrief).toContainText('Lv2：防御まで');
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(debrief).toContainText('Lv3：理解まで');
  await page.locator('.debrief .mastery-evidence summary').click();
  await expect(page.locator('.debrief .mastery-evidence-list li')).toHaveText([/^★1：再現の達成印（課題 test-pack/, /^★2：防御の達成印/, /^★3：再現・防御・理解がそろった/]);

  await backToList(page).click();
  // 完了した課題の行には、その分類の習熟度が付く
  await expect(page.locator('[data-mission="test-pack"] .mastery-line')).toHaveAttribute('data-stars', '3');
  await openRecords(page);
  await expect(authorization(page)).toHaveText('認可の習熟度★★★☆☆Lv3：理解まで');
});
