// 課題一覧には「取り組み」を出さない。記録ページの習熟度と実績は残す。
import { expect, openHome, openRecords, test } from './fixtures';

test('課題一覧には次の一歩と課題の表があり、取り組みと別条件の挑戦は出ない', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('heading', { level: 1, name: '課題', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /まずは練習/ })).toBeVisible();
  await expect(page.locator('.mission-section')).toBeVisible();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '復習クエスト', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '週間目標', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await expect(page.locator('.mission-list .xp-summary')).toHaveCount(0);

  await openRecords(page);
  await expect(page.getByRole('heading', { level: 1, name: '記録', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '取り組み', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '習熟度', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '実績', exact: true })).toBeVisible();
});
