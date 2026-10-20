// 修正前後の実測と、再開後も残る改善履歴を確認する。
import { expect, openMission, startMission, test, verifyResults, verifyWith } from './fixtures';

function passedCount(heading: string): number {
  const open = heading.indexOf('（');
  const slash = heading.indexOf('/', open + 1);
  const count = Number(heading.slice(open + 1, slash));
  if (open < 0 || slash < 0 || !Number.isInteger(count)) throw new Error(`合格数を読めません: ${heading}`);
  return count;
}

test('不十分な対策・全面停止・正しい対策の結論と、改善履歴を保存して再開できる', async ({ page }) => {
  await startMission(page, 'test-pack');
  await verifyWith(page, '表示だけ変える');
  const results = verifyResults(page);
  const conclusions = results.locator('.verify-conclusions');
  await expect(conclusions.locator('[data-group="attack"]')).toContainText('攻撃が通ってしまう');
  await expect(conclusions).not.toContainText('%');
  await expect(results.locator('.security-status')).toHaveCount(0);
  await expect(results.locator('.outcome').first()).toBeHidden();
  const normalHeading = results.locator('.result-group h4', { hasText: '正常な利用ができるか' });
  const original = passedCount((await normalHeading.textContent()) ?? '');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.locator('.security-history > ol > li')).toHaveCount(1);

  await verifyWith(page, 'すべて拒否する');
  await expect(conclusions.locator('[data-group="normal"]')).toContainText('不合格');
  const stopped = passedCount((await normalHeading.textContent()) ?? '');
  expect(stopped, '全面停止では正常系の合格数が減る').toBeLessThan(original);

  await verifyWith(page, '所有者を照合する');
  await expect(conclusions.locator('[data-group="attack"]')).toContainText('合格');
  await expect(conclusions).not.toContainText('%');
  await page.getByRole('tab', { name: '振り返り' }).click();
  const history = page.locator('.security-history');
  const entries = history.locator(':scope > ol > li');
  await expect(entries).toHaveCount(3);
  for (const [index, label] of ['表示だけ変える', 'すべて拒否する', '所有者を照合する'].entries()) {
    await expect(entries.nth(index)).toContainText(label);
  }
  await expect(entries.nth(1)).toContainText('攻撃を防げたか 0→1');
  await expect(entries.nth(2)).toContainText('防御できました');
  const times = await entries.locator('time').evaluateAll((elements) => elements.map((element) => element.getAttribute('datetime')));
  expect(times, '時刻順に履歴が並ぶ').toEqual([...times].sort());
  const saved = await history.innerText();
  await page.reload();
  await openMission(page, 'test-pack', { resume: true });
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(history).toHaveText(saved, { useInnerText: true });
  await expect(page.locator('.debrief .security-status')).toHaveCount(0);
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(verifyResults(page).locator('.verify-conclusions')).toContainText('合格');
  await expect(verifyResults(page)).not.toContainText('%');
});

test('振り返りは対策取り消し・リセット・再開後の古い検証結果を警告する', async ({ page }) => {
  await startMission(page, 'test-pack');
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page).locator('.verify-conclusions')).not.toContainText('%');
  const warning = page.locator('.debrief > .banner-warn');
  await page.getByRole('button', { name: '対策を取り消す', exact: true }).click();
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(warning).toHaveText('対策を変えたため、この結果はいまの構成のものではありません。もう一度検証してください。');
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '初期状態へ戻す', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '初期状態へ戻す', exact: true }).click();
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(warning).toBeVisible();
  await page.reload();
  await openMission(page, 'test-pack', { resume: true });
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(warning).toBeVisible();
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page).locator('[data-group="attack"]')).toContainText('合格');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(warning).toHaveCount(0);
});
