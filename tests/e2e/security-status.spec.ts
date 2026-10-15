// 修正前後の実測と、再開後も残る改善履歴を確認する。
import { expect, openMission, startMission, test, verifyResults, verifyWith } from './fixtures';

test('不十分・全面停止・正しい対策の数値と改善履歴を保存して再開できる', async ({ page }) => {
  await startMission(page, 'test-pack');
  await verifyWith(page, '表示だけ変える');
  const comparison = verifyResults(page).locator('.security-status');
  const before = comparison.locator('[data-phase="before"]');
  const after = comparison.locator('[data-phase="after"]');
  await expect(comparison.getByRole('heading', { name: '安全化状況' })).toBeVisible();
  await expect(comparison).toContainText('通ったテスト数 ÷ この課題の検証で実行したテスト数');
  await expect(comparison).toContainText('セキュリティ全般の保証や、本番で使える安全性を意味しません');
  await expect(before.locator('[data-group="attack"]')).toHaveText('攻撃を防げたか 0/1 件合格');
  await expect(after.locator('[data-group="attack"]')).toHaveText('攻撃を防げたか 0/1 件合格');
  await expect(after).not.toContainText('100%');
  const normalBefore = await before.locator('[data-group="normal"]').innerText();
  const original = Number(normalBefore.split(' ')[1]?.split('/')[0]);
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.locator('.security-history > ol > li')).toHaveCount(1);

  await verifyWith(page, 'すべて拒否する');
  await expect(after.locator('[data-group="normal"]')).not.toHaveText(normalBefore);
  const normalAfter = await after.locator('[data-group="normal"]').innerText();
  expect(Number(normalAfter.split(' ')[1]?.split('/')[0]), '全面停止では正常系の合格数が減る').toBeLessThan(original);

  await verifyWith(page, '所有者を照合する');
  await expect(after).toContainText('100%');
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
  await expect(page.locator('.debrief .security-status')).toContainText('修正前');
});

test('振り返りは対策取り消し・リセット・再開後の古い検証結果を警告する', async ({ page }) => {
  await startMission(page, 'test-pack');
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page).locator('[data-phase="after"]')).toContainText('100%');
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
  await expect(verifyResults(page).locator('[data-phase="after"]')).toContainText('100%');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(warning).toHaveCount(0);
});
