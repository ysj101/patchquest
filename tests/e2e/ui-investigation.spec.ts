// 学習UI：演習画面と調査パネル（Issue #12）
import type { Page } from '@playwright/test';
import { expect, preview, startMission, test } from './fixtures';

async function startExercise(page: Page): Promise<void> {
  await startMission(page, 'test-pack');
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
}

/** 観測ログに記録された、alice の一覧取得の応答からノート ID を読む */
async function aliceNoteId(page: Page): Promise<number> {
  const entry = page.locator('.log-entry').filter({ hasText: 'alice → GET /notes' }).first();
  await entry.locator('summary').click();
  const body = await entry.locator('.log-block').nth(1).locator('pre').textContent();
  return (JSON.parse(body!) as { notes: { id: number }[] }).notes[0]!.id;
}

test.beforeEach(async ({ page }) => {
  await startExercise(page);
});

test('状況タブに問い合わせと目標が出て、矢印キーでタブを切り替えられる', async ({ page }) => {
  await expect(page.getByRole('tabpanel', { name: '状況' })).toContainText('他人のノートが見える');
  await page.getByRole('tab', { name: '状況' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '調査' })).toBeFocused();
  await expect(page.getByRole('tab', { name: '調査' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: '調査' })).toContainText('実際のネットワーク通信ではありません');
});

test('キーボードで利用者を切り替え、定型の操作で事故を再現すると再現の検印が押される', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  const id = await aliceNoteId(page);

  await page.getByRole('radio', { name: 'alice' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'bob' })).toBeChecked();
  await expect(preview(page).getByRole('heading', { name: 'ノート（bob）' })).toBeVisible();
  await expect(page.locator('.viewer')).toHaveText('bob');

  await page.getByLabel('ノート ID').fill(String(id));
  await page.getByLabel('ノート ID').press('Enter');
  const entry = page.locator('.log-entry').first();
  await expect(entry.locator('summary')).toContainText(`bob → GET /notes/${id}`);
  await expect(entry.locator('.status')).toHaveText(/200/);
  await expect(page.getByRole('list', { name: '達成印' })).toContainText('再現：達成');
  await expect(page.locator('.state-stamp')).toHaveText('調査中');
});

test('リクエスト編集欄は入力の誤りと大きすぎる入力を理由付きで知らせる', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  const editor = page.locator('[data-anchor="request-editor"]');
  const send = editor.getByRole('button', { name: 'このリクエストを送る' });

  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill('{ body: こわれた JSON }');
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText(/本文は JSON で書いてください/);

  await editor.getByLabel('パス').fill('notes');
  await editor.getByLabel('本文（JSON）').fill('{}');
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText('パスは / から始めてください');

  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill(JSON.stringify({ body: 'あ'.repeat(3000) }));
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText(/入力が大きすぎます/);
});

test('教材由来の文字列は観測ログでも文字のまま表示され、HTML として解釈されない', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => (dialogs.push(d.message()), void d.dismiss()));
  await page.getByRole('tab', { name: '調査' }).click();
  const editor = page.locator('[data-anchor="request-editor"]');
  const payload = '<img src="x" onerror="alert(1)"><b>太字</b>';
  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill(JSON.stringify({ body: payload }));
  await editor.getByRole('button', { name: 'このリクエストを送る' }).click();
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();

  // 開き直した画面の一覧取得が記録されるのを待ってから開く
  const listings = page.locator('.log-entry').filter({ hasText: 'alice → GET /notes' });
  await expect(listings).toHaveCount(2);
  const listing = listings.first();
  await listing.locator('summary').click();
  await expect(listing).toContainText(payload.replaceAll('"', '\\"'));
  await expect(page.locator('.log img, .log b')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});
