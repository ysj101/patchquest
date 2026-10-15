// キーボードだけで導入のスキップ・設定変更・再現・対策・理解確認まで完走できることを確かめる。
import { expect, expectCalloutMatchesVerdict, expectWorkbench, launchButton, preview, settingsButton, tabTo, test, ticketSeals, turnMotionOffWithKeyboard } from './fixtures';

test('キーボードだけで導入を飛ばし、動きをオフにして演習を完了できる', async ({ page }) => {
  await page.goto('/');
  await tabTo(page, page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '演習を始める' })).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(launchButton(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expectWorkbench(page);
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();

  await tabTo(page, settingsButton(page));
  await turnMotionOffWithKeyboard(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');

  await tabTo(page, '状況');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '調査' })).toBeFocused();
  // 初期画面が残した alice の一覧応答だけを読み、操作はキーボードで行う。
  const entry = page.locator('.log-entry').filter({ hasText: 'alice → GET /notes' }).first();
  await tabTo(page, entry.locator('summary'));
  await page.keyboard.press('Enter');
  const response = await entry.locator('.log-block').nth(1).locator('pre').evaluate((element) => element.textContent);
  if (!response) throw new Error('alice の一覧応答がありません');
  const body = JSON.parse(response) as { notes: { id: number }[] };
  const note = body.notes[0];
  if (!note) throw new Error('alice のノートがありません');
  await tabTo(page, page.getByRole('radio', { name: 'alice', exact: true }));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'bob', exact: true })).toBeChecked();
  await tabTo(page, page.getByLabel('ノート ID', { exact: true }));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(String(note.id));
  await tabTo(page, '送る');
  await page.keyboard.press('Enter');
  await expect(ticketSeals(page)).toContainText('再現：達成');

  await tabTo(page, '調査');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '対策' })).toBeFocused();
  const defense = page.getByRole('radio', { name: /^所有者を照合する/ });
  await tabTo(page, defense);
  await page.keyboard.press('Space');
  await expect(defense).toBeChecked();
  await tabTo(page, 'この対策を適用する');
  await page.keyboard.press('Enter');
  await expect(page.getByText('適用中の対策：所有者を照合する')).toBeVisible();
  await tabTo(page, '攻撃と普段の使い方を検証する');
  await page.keyboard.press('Enter');
  await expectCalloutMatchesVerdict(page);
  await expect(ticketSeals(page)).toContainText('防御：達成');

  await tabTo(page, '対策');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '振り返り' })).toBeFocused();
  await tabTo(page, page.getByRole('radio', { name: '取得時に所有者を照合する', exact: true }));
  await page.keyboard.press('Space');
  await tabTo(page, '回答する');
  await page.keyboard.press('Enter');
  for (const seal of ['再現：達成', '防御：達成', '理解：達成']) await expect(ticketSeals(page)).toContainText(seal);
  await expect(page.getByRole('heading', { name: 'ステージ 5 / 5', exact: true })).toBeVisible();
});
