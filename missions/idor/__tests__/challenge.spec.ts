// 完走しても「別条件で挑戦する」は出さない。やり直しは「新しいデータで再挑戦する」のまま。
import { backToList, expect, openHome, startMission, test } from '../../../tests/e2e/fixtures';
import { answerTransferCheck, reproduceByPreviousMemo, secureByOwnerCheck } from './idor-flow';

test('完走した振り返りと課題の表に、別条件で挑戦するボタンはない', async ({ page }) => {
  test.setTimeout(120_000);
  await startMission(page, 'idor');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await reproduceByPreviousMemo(page);
  await secureByOwnerCheck(page);
  await answerTransferCheck(page);
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '別条件で挑戦' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新しいデータで再挑戦する' })).toBeVisible();

  await backToList(page).click();
  await openHome(page);
  const card = page.locator('[data-mission="idor"]');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '続きから始める' })).toBeVisible();
});
