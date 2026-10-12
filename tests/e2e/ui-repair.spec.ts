// 学習UI：対策パネル・検証結果・ヒント・振り返り（Issue #13）
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const preview = (page: Page) => page.frameLocator('.preview-slot iframe');
const seals = (page: Page) => page.locator('.ticket').getByRole('list', { name: '達成印' });

async function startExercise(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
}

/** bob として alice のノートを読み、再現の検印を得る */
async function reproduce(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '調査' }).click();
  const entry = page.locator('.log-entry').filter({ hasText: 'alice → GET /notes' }).first();
  await entry.locator('summary').click();
  const id = (JSON.parse((await entry.locator('.log-block').nth(1).locator('pre').textContent())!) as { notes: { id: number }[] }).notes[0]!.id;
  await page.getByRole('radio', { name: 'bob' }).check();
  await page.getByLabel('ノート ID').fill(String(id));
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(seals(page)).toContainText('再現：達成');
}

async function verifyWith(page: Page, defense: string): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: new RegExp(defense) }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(page.getByText(`適用中の対策：${defense}`)).toBeVisible();
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
}

test.beforeEach(async ({ page }) => {
  await startExercise(page);
});

test('正常系を壊す対策は、検証結果に理由と期待・実測が出て合格しない', async ({ page }) => {
  await verifyWith(page, 'すべて拒否する');
  const results = page.locator('[data-anchor="results"]');
  await expect(results).toContainText('まだ合格ではありません 普段の使い方が壊れています。', { timeout: 15_000 });
  const normal = results.locator('.result-group').filter({ hasText: '正常な利用ができるか' });
  await expect(normal.locator('.outcome')).toContainText('不合格');
  await expect(normal.locator('.outcome')).toContainText('status が 200 ではない（実測 403）');
  await expect(seals(page)).toContainText('防御：未達成');
  await expect(page.getByRole('heading', { name: '検証結果' })).toBeFocused();
});

test('再現・正しい対策・理解確認をそろえると解決になり、対策を変えると防御は再検証待ちになる', async ({ page }) => {
  await reproduce(page);
  await verifyWith(page, '所有者を照合する');
  await expect(page.locator('[data-anchor="results"]')).toContainText('防御できました', { timeout: 15_000 });
  await expect(seals(page)).toContainText('防御：達成');

  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.getByRole('tabpanel', { name: '振り返り' })).toContainText('所有者を照合していない');
  await page.getByRole('radio', { name: '一覧のリンクを隠す' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(page.locator('.question')).toContainText('不正解');
  await expect(page.locator('.question')).toContainText('直接の要求は防げない');
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');
  await expect(page.locator('.state-stamp')).toHaveText('解決');

  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '対策を取り消す' }).click();
  await expect(page.locator('[data-anchor="results"]')).toContainText('この結果はいまの構成のものではありません');
  await expect(seals(page)).toContainText('防御：記録あり（再検証で確定）');
  await expect(page.locator('.state-stamp')).toHaveText('修正中');
});

test('キーボードで対策を選び、適用して検証できる', async ({ page }) => {
  await page.getByRole('tab', { name: '状況' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '対策' })).toBeFocused();
  await page.getByRole('radio', { name: /所有者を照合する/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /すべて拒否する/ })).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByText('適用中の対策：すべて拒否する')).toBeVisible();
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-anchor="results"]')).toContainText('まだ合格ではありません', { timeout: 15_000 });
});

test('ヒントは段階的に開け、解法は確認してから表示する', async ({ page }) => {
  const hints = page.locator('[data-anchor="hints"]');
  await hints.getByRole('button', { name: 'ヒント 1（着眼点）を見る' }).click();
  await expect(hints).toContainText('ID を変えると何が返るか');
  await expect(hints.getByRole('button', { name: 'ヒント 2（調査方法）を見る' })).toBeFocused();
  await page.keyboard.press('Enter');
  await hints.getByRole('button', { name: 'ヒント 3（修正方針）を見る' }).click();
  await hints.getByRole('button', { name: '解法を見る' }).click();
  await expect(page.getByRole('dialog')).toContainText('記録に残ります');
  await page.getByRole('dialog').getByRole('button', { name: '解法を見る' }).click();
  await expect(hints).toContainText('note.read で所有者を照合する');
});

test('初期状態へ戻すと対策とデータが戻り、新しいデータで再挑戦すると新しい演習票になる', async ({ page }) => {
  const editor = page.locator('[data-anchor="request-editor"]');
  await page.getByRole('tab', { name: '調査' }).click();
  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill('{"body":"あとで消えるノート"}');
  await editor.getByRole('button', { name: 'このリクエストを送る' }).click();
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await expect(preview(page).getByText('あとで消えるノート')).toBeVisible();
  await verifyWith(page, '所有者を照合する');
  await expect(page.locator('[data-anchor="results"]')).toContainText('防御できました', { timeout: 15_000 });

  await page.getByRole('button', { name: '初期状態へ戻す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '初期状態へ戻す' }).click();
  // 戻した直後に画面を開き直すので、「調査を始められます」か「調査中」になる
  await expect(page.locator('.state-stamp')).toHaveText(/調査/);
  await expect(page.getByText('対策は適用していません（脆弱な状態）')).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
  await expect(preview(page).getByText('あとで消えるノート')).toHaveCount(0);

  const ticket = await page.locator('.ticket-id').textContent();
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('button', { name: '新しいデータで再挑戦する' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(page.locator('.ticket-id')).not.toHaveText(ticket!);
  await expect(seals(page)).toContainText('再現：未達成');
});
