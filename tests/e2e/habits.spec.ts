// 記録ページの復習クエストと週間目標（Issue #76）。課題を解決すると一覧に復習の案内が出て、記録ページで解くと解説と XP が示され、週間目標は未達でも警告を出さない
import type { Page } from '@playwright/test';
import { TEST_PACK_ANSWERS, answerTransferCheck, expect, openHome, openMission, openMissions, openRecords, reproduceNoteLeak, test, ticketSeals, verifyWith } from './fixtures';

const review = (page: Page) => page.getByRole('region', { name: '復習クエスト', exact: true });
const weekly = (page: Page) => page.getByRole('region', { name: '週間目標', exact: true });
const weeklyStatus = (page: Page) => weekly(page).locator('.weekly-status');
const xpSummary = (page: Page) => page.locator('.xp-summary');

/** test-pack を最後まで解き、課題一覧へ戻る */
async function completeTestPack(page: Page): Promise<void> {
  await openMission(page, 'test-pack');
  await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();
  await page.getByRole('tab', { name: '調査' }).click();
  await reproduceNoteLeak(page);
  await verifyWith(page, '所有者を照合する');
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await answerTransferCheck(page, TEST_PACK_ANSWERS);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
}

test('課題を解決すると復習の問題が出て、正解すると解説と 5 XP が示され、同じ日の 2 回目は XP が増えない', async ({ page }) => {
  await openHome(page);
  // 解決前は一覧に復習の案内を出さず、記録ページには案内だけがある
  await expect(page.locator('.review-notice')).toHaveCount(0);
  await openRecords(page);
  await expect(review(page)).toContainText('課題を 1 つ解決すると、ここに復習の問題が出ます');
  await expect(review(page).getByRole('radio')).toHaveCount(0);

  await completeTestPack(page);
  // 一覧の 1 行の案内から記録ページへ
  await expect(page.locator('.review-notice')).toContainText('今日の復習が 1 問あります');
  await page.locator('.review-notice').getByRole('button', { name: '記録ページで解く' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '記録', exact: true })).toBeVisible();
  await expect(xpSummary(page)).toContainText('140 XP');
  await expect(review(page)).toContainText('検証用パック：有効な対策はどれか');
  await expect(review(page)).toContainText('状況：carol が自分の ID を書き換えて要求した');
  await expect(ticketSeals(page)).toBeHidden();

  await review(page).getByRole('radio', { name: '一覧のリンクを隠す' }).check();
  await review(page).getByRole('button', { name: '回答する' }).click();
  const result = review(page).locator('.review-result');
  await expect(result).toContainText('不正解');
  await expect(result).toContainText('直接の要求は防げない');
  await expect(result).not.toContainText('XP');
  await review(page).getByRole('button', { name: '次の復習へ' }).click();
  await expect(xpSummary(page)).toContainText('140 XP');

  await review(page).getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await review(page).getByRole('button', { name: '回答する' }).click();
  await expect(result).toContainText('正解');
  await expect(result).toContainText('処理側で照合すれば ID を変えても読めない');
  await expect(result).toContainText('+5 XP を獲得しました');
  await review(page).getByRole('button', { name: '次の復習へ' }).click();
  await expect(xpSummary(page)).toContainText('145 XP');

  // 復習だけでは達成印も習熟度の★も変わらない
  await openMissions(page);
  await expect(page.locator('[data-mission="test-pack"] .mastery-line')).toHaveAttribute('data-stars', '3');
  await openRecords(page);
  await review(page).getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await review(page).getByRole('button', { name: '回答する' }).click();
  await expect(result).toContainText('今日の復習 XP は獲得済みです');
  await review(page).getByRole('button', { name: '次の復習へ' }).click();
  await expect(xpSummary(page)).toContainText('145 XP');
  await page.locator('.mastery .mastery-evidence summary').first().click();
  await expect(page.locator('.mastery .mastery-review').first()).toContainText('復習の正答：1 問');
});

test('週間目標は任意で選べ、今週の回数を文字で示し、未達でも警告を出さない', async ({ page }) => {
  await openHome(page);
  await openRecords(page);
  await expect(weekly(page)).toContainText('月曜始まりで、この端末の時刻で区切ります');
  await expect(weekly(page).getByRole('radio', { name: '設定しない' })).toBeChecked();
  await expect(weeklyStatus(page)).toHaveText(/の週はまだ 0 回です。$/);

  await weekly(page).getByRole('radio', { name: '週 2〜3 回' }).check();
  await expect(weekly(page).getByRole('radio', { name: '週 2〜3 回' })).toBeChecked();
  await expect(weeklyStatus(page)).toHaveText(/の週はまだ 0 回です（目標：週 2〜3 回）。$/);
  await expect(weekly(page).locator('.banner-warn, .status-alert, .status-failed, .status-error')).toHaveCount(0);
  await expect(weekly(page)).not.toContainText('⚠');

  await completeTestPack(page);
  await openRecords(page);
  await expect(weekly(page).getByRole('radio', { name: '週 2〜3 回' })).toBeChecked();
  await expect(weeklyStatus(page)).toHaveText(/の週は 1 回取り組みました（目標：週 2〜3 回）。$/);
  await expect(weeklyStatus(page)).not.toContainText('届きました');
  await expect(weekly(page).locator('.banner-warn, .status-alert, .status-failed, .status-error')).toHaveCount(0);

  await weekly(page).getByRole('radio', { name: '週 1 回' }).check();
  await expect(weeklyStatus(page)).toHaveText(/の週は 1 回取り組みました（目標：週 1 回）。目標に届きました。$/);

  await page.reload();
  await openRecords(page);
  await expect(weekly(page).getByRole('radio', { name: '週 1 回' })).toBeChecked();
  await weekly(page).getByRole('radio', { name: '設定しない' }).check();
  await expect(weeklyStatus(page)).toHaveText(/の週は 1 回取り組みました。$/);
});
