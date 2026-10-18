// IDOR を完走したあと「別条件で挑戦」すると、使っていない seed の新しい演習票になり、ヒントは閉じ、
// 理解確認は 1 問だけ（2 回目の挑戦では前回と違う設問）になる。達成印の判定は通常の演習と同じ（A21）
import type { Page } from '@playwright/test';
import { backToList, expect, launchButton, openHome, startMission, test, ticketSeals as seals } from '../../../tests/e2e/fixtures';
import { answerTransferCheck, reproduceByPreviousMemo, secureByOwnerCheck } from './idor-flow';

const mastery = (page: Page) => page.locator('.debrief .mastery-line[data-category="authorization"]');

/** 振り返りの習熟度の根拠を開き、その★の行が指定の seed の演習を指していることを確かめる */
async function expectEvidence(page: Page, stars: number, seed: string): Promise<void> {
  const evidence = page.locator('.debrief .mastery-evidence');
  if (!(await evidence.locator('ol').isVisible())) await evidence.locator('summary').click();
  await expect(evidence.locator('li').filter({ hasText: `★${stars}：` })).toContainText(`課題 idor・seed ${seed}`);
}

const seedOf = async (page: Page): Promise<string> => {
  const ticket = await page.locator('.ticket-id').textContent();
  const seed = /seed (\d+)/.exec(ticket ?? '')?.[1];
  if (!seed) throw new Error(`演習票に seed がありません：${ticket}`);
  return seed;
};

/** 再現 → 所有者の照合 → 理解確認、で 3 つの達成印をそろえる。答えた設問 ID を返す */
async function complete(page: Page): Promise<string[]> {
  await reproduceByPreviousMemo(page);
  await secureByOwnerCheck(page);
  return answerTransferCheck(page);
}

async function startChallengeFromDebrief(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.locator('.debrief .challenge').getByRole('button', { name: '別条件で挑戦する' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  // 2 回目以降なので導入は出ない
  await expect(launchButton(page)).toHaveCount(0);
  await expect(page.locator('#exercise-title')).toBeFocused();
}

test('完走した課題を別条件で挑戦すると、新しい seed・閉じたヒント・前回と違う 1 問の理解確認になり、達成印をそろえ直せる', async ({ page }) => {
  test.setTimeout(240_000);
  await startMission(page, 'idor');
  const firstSeed = await seedOf(page);
  // 完走前の振り返りには「別条件で挑戦」が出ない
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.locator('.debrief .challenge')).toHaveCount(0);
  const firstAsked = await complete(page);
  expect(firstAsked).toEqual(['invoice-cause', 'comment-edit-defense', 'photo-download-cause', 'orders-api-defense']);
  await expect(mastery(page)).toHaveAttribute('data-stars', '3');

  // 1 回目の挑戦：全問を出し終えているので同じ設問を 1 問出し直すと知らせる
  await startChallengeFromDebrief(page);
  const secondSeed = await seedOf(page);
  expect(secondSeed).not.toBe(firstSeed);
  await expect(page.locator('.ticket-id')).toContainText('別条件で挑戦中');
  await page.getByRole('tab', { name: '状況' }).click();
  await expect(page.getByRole('button', { name: 'ヒント 1（着眼点）を見る' })).toBeVisible();
  await expect(page.locator('.hint')).toHaveCount(0);
  await expect(seals(page)).toContainText('再現：未達成');
  const secondAsked = await complete(page);
  expect(secondAsked).toHaveLength(1);
  await expect(page.locator('[data-transfer-note="repeated"]')).toBeVisible();
  // 別の seed で 3 印をそろえたので、認可の習熟度が ★4 に上がり、根拠にこの演習票の seed が載る
  await expect(mastery(page)).toHaveAttribute('data-stars', '4');
  await expectEvidence(page, 4, secondSeed);

  // 2 回目の挑戦：出題回数の少ない、前回と違う設問になる
  await startChallengeFromDebrief(page);
  const thirdSeed = await seedOf(page);
  expect([firstSeed, secondSeed]).not.toContain(thirdSeed);
  const thirdAsked = await complete(page);
  expect(thirdAsked).toHaveLength(1);
  expect(thirdAsked).not.toEqual(secondAsked);
  await expect(page.locator('[data-transfer-note="fresh"]')).toBeVisible();
  await expect(mastery(page)).toHaveAttribute('data-stars', '5');
  await expectEvidence(page, 5, thirdSeed);

  // 一覧のカードからも挑戦でき、同じ脆弱性の課題として 1 つのまま並ぶ
  await backToList(page).click();
  await openHome(page);
  const card = page.locator('[data-mission="idor"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.mastery-line')).toHaveAttribute('data-stars', '5');
  await card.getByRole('button', { name: '別条件で挑戦する' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  expect([firstSeed, secondSeed, thirdSeed]).not.toContain(await seedOf(page));
});
