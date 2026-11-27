// 完走しても「別条件で挑戦する」は出さない。やり直しは課題一覧の「もう一度解く」で行う。
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

  await backToList(page).click();
  await openHome(page);
  const card = page.locator('[data-mission="idor"]');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('button', { name: '別条件で挑戦する' })).toHaveCount(0);
  // 達成印が 3 つそろった課題のボタンは「もう一度解く」だけ
  await expect(card.locator('.mission-actions').getByRole('button')).toHaveText(['もう一度解く']);
});
