// CSP の課題を、学習者と同じ操作（表示する利用者の切り替え・ページの中のリンクとフォーム）で確かめる。
// ページは Service Worker が本物の HTTP 応答として配り、スクリプトを動かすか止めるかは Chrome が決める
import type { Page } from '@playwright/test';
import { expect, expectBrokenNormalThenReset, expectDefended, preview, startMission, test, testRepair, ticketSeals, verifyResults } from '../../../tests/e2e/fixtures';

/** コメントに書きこまれたスクリプトが動いたときに、ページの上に出る知らせ */
const marker = (page: Page) => preview(page).getByRole('status').filter({ hasText: 'スクリプトが動きました' });
const count = (page: Page) => preview(page).locator('#count');

/** 管理者として設定のページを開き、Content-Security-Policy の値を保存して、掲示板へ戻る */
async function savePolicy(page: Page, value: string): Promise<void> {
  await page.getByRole('radio', { name: 'admin' }).check();
  await preview(page).getByRole('link', { name: '管理：応答ヘッダの設定' }).click();
  await preview(page).getByRole('textbox', { name: 'Content-Security-Policy' }).fill(value);
  await preview(page).getByRole('button', { name: '保存する' }).click();
  await expect(preview(page).getByText('いまの値：')).toContainText(value);
  await preview(page).getByRole('link', { name: '掲示板へ戻る' }).click();
  await expect(preview(page).getByRole('heading', { name: 'みんなの掲示板' })).toBeVisible();
}

test('掲示板を開くと書きこまれたスクリプトが動き、応答ヘッダに CSP を付けると Chrome が止める', async ({ page }) => {
  await startMission(page, 'csp');

  // 開いただけで、コメントのスクリプトが動く。ページ自身のスクリプトも動き、件数が出る
  await expect(marker(page)).toBeVisible();
  await expect(count(page)).toHaveText(/^コメント \d 件$/);
  await expect(ticketSeals(page)).toContainText('再現：達成');

  // 足りない値：ページの中に書かれたスクリプトも許すので、止まらない
  await savePolicy(page, "script-src 'self' 'unsafe-inline'");
  await expect(marker(page)).toBeVisible();
  await testRepair(page);
  await expect(verifyResults(page)).toContainText('まだ合格ではありません', { timeout: 30_000 });
  await expect(ticketSeals(page)).toContainText('防御：未達成');

  // 止めすぎの値：掲示板自身のスクリプトも止まり、件数が出ない
  await savePolicy(page, "script-src 'none'");
  await expect(marker(page)).toHaveCount(0);
  await expect(count(page)).toHaveText('コメントの数を数えています…');
  await testRepair(page);
  await expectBrokenNormalThenReset(page);
  // 最初の状態に戻ると、ヘッダのない掲示板が開き直り、スクリプトがまた動く
  await expect(marker(page)).toBeVisible();

  // 正しい値：書きこまれたスクリプトだけが止まり、件数は出る。観測ログに、ブラウザが止めたものが出る
  await savePolicy(page, "script-src 'self'");
  await expect(marker(page)).toHaveCount(0);
  await expect(count(page)).toHaveText(/^コメント \d 件$/);
  await page.getByRole('tab', { name: '調査' }).click();
  // ページで起きたことは「画面」の記録に入る。掲示板を開き直した直後の 2 件（止めたもの・数えた件数）を開く
  const pageEvents = page.locator('.log-entry').filter({ hasText: 'admin が画面 /board を表示' });
  await pageEvents.nth(0).locator('summary').click();
  await pageEvents.nth(1).locator('summary').click();
  await expect(page.locator('.log')).toContainText('ブラウザが止めたもの：inline（守った指定：script-src-elem）');
  await testRepair(page);
  await expectDefended(page);
});

test('掲示板のページは不透明なオリジンで開き、学習UIの DOM・保存領域に届かない', async ({ page }) => {
  await startMission(page, 'csp');
  const element = page.locator('.preview-slot iframe');
  const frame = await (await element.elementHandle()).contentFrame();
  if (!frame) throw new Error('教材アプリの枠がありません');

  const seen = await frame.evaluate(() => {
    const attempt = (work: () => unknown): string => {
      try {
        return String(work());
      } catch (error) {
        return error instanceof Error ? error.name : String(error);
      }
    };
    return {
      origin: self.origin,
      parentDom: attempt(() => parent.document.title),
      parentStorage: attempt(() => parent.localStorage.length),
      ownStorage: attempt(() => localStorage.length),
      cookie: attempt(() => document.cookie),
      indexedDb: attempt(() => indexedDB.open('pq')),
    };
  });

  expect(seen).toEqual({ origin: 'null', parentDom: 'SecurityError', parentStorage: 'SecurityError', ownStorage: 'SecurityError', cookie: 'SecurityError', indexedDb: 'SecurityError' });
});
