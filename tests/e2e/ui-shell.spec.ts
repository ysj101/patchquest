// 学習UI：アプリシェル・ミッション一覧・開始前チェック（Issue #11）
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Tab キーだけで、指定した名前のボタンまでフォーカスを移す */
async function tabTo(page: Page, name: string | RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    if (typeof name === 'string' ? text === name : name.test(text)) return;
  }
  throw new Error(`${name} までフォーカスを移せませんでした`);
}

const card = (page: Page, id: string) => page.locator(`[data-mission="${id}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '事故を調べて、直して、確かめる' })).toBeVisible();
});

test('キーボードだけで課題一覧から開始前チェックを経て演習を始められる', async ({ page }) => {
  await tabTo(page, 'この課題を始める');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: '開始前チェック' })).toBeVisible();
  await expect(page.getByText('この確認はあなたの達成には数えません')).toBeVisible();

  // 合格すると「演習を始める」にフォーカスが移る
  const begin = page.getByRole('button', { name: '演習を始める' });
  await expect(begin).toBeFocused({ timeout: 15_000 });
  await expect(page.locator('.check .status-passed')).toHaveCount(4);
  await page.keyboard.press('Enter');

  // 一覧の先頭は練習用パック
  await expect(page.getByRole('heading', { level: 1, name: '練習：長すぎるメモのタイトル' })).toBeFocused();
  await expect(page.getByText('学習用に脆弱性を注入した架空のサービスです。', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '達成印' })).toContainText('再現：未達成');
});

test('攻撃が成立しない課題は開始できず、理由と次の操作を示す', async ({ page }) => {
  await card(page, 'test-broken').getByRole('button', { name: 'この課題を始める' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('開始できません（あなたの不合格には数えません）', { timeout: 15_000 });
  await expect(alert).toContainText('注入後に攻撃が成立しませんでした');
  await expect(page.locator('.check').filter({ hasText: '脆弱性の注入' }).locator('.status')).toHaveText(/不合格/);
  await page.getByRole('button', { name: 'もう一度チェックする' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '事故を調べて、直して、確かめる' })).toBeVisible();
});

test('進捗を保存し、続きから始め、書き出し・読み込み・削除ができる', async ({ page }) => {
  await card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  const ticket = await page.locator('.ticket-id').textContent();
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();

  // 続きから始めると、同じ演習票（同じ seed）で環境を作り直す
  await card(page, 'test-pack').getByRole('button', { name: '続きから始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(page.locator('.ticket-id')).toHaveText(ticket!);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^patchquest-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(exported).toMatchObject({ format: 'patchquest-progress', attempts: [expect.objectContaining({ missionId: 'test-pack' })] });

  // 不正なファイルは拒否し、今の進捗を残す
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.getByRole('alert')).toContainText('今の進捗はそのままです');
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();

  // 削除は確認してから行う。やめるを選べば何も消えない
  await page.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.keyboard.press('Escape');
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();
  await page.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' })).toBeVisible();

  // 書き出したファイルを読み込めば元に戻る
  await page.locator('input[type=file]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();
});

test('ブラウザに保存できないときは、書き出しを促す', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('blocked for test', 'SecurityError');
      },
    });
  });
  await page.reload();
  await expect(page.getByText(/ブラウザに保存できません.*「進捗を書き出す」で保存してください/)).toBeVisible();
});
