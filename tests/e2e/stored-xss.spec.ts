// ミッション2「コメントからのスクリプト実行を防ぐ」（保存型 XSS、Issue #18）。
// 検証済みの固定ペイロードを保存し、別の利用者が開くと実行マーカーで再現する（A08）。
// script タグの削除では不合格、コメントの非表示は正常系が壊れ、文字としての表示で合格する（A09）。
// ペイロードは隔離 iframe の外の Host では要素にならない（A17）
import { expect, expectCalloutMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from './fixtures';

const CAROL_COMMENT = '来週は演習問題を解いてみます';
const ATTACK = '<img src="x" onerror="pqMarker()">';

test('保存した攻撃コメントが別の利用者の画面で実行され、文字としての表示だけが合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('[data-mission="stored-xss"]').getByRole('heading', { name: 'コメントからのスクリプト実行を防ぐ' })).toBeVisible();
  await expect(page.locator('[data-mission="stored-xss"]')).toContainText('目安 15 分');
  await startMission(page, 'stored-xss');
  const app = preview(page);

  // A08：検証済みペイロードを保存し、投稿者以外が共有ページを開くと実行マーカーが出る
  await page.getByRole('tab', { name: '調査' }).click();
  await page.getByLabel('投稿するコメント').selectOption({ label: '検証済みの攻撃コメント（画像の onerror）' });
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await page.getByRole('radio', { name: /^bob/ }).check();
  await expect(app.getByText('bob さんとしてログイン中')).toBeVisible();
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await expect(seals(page)).toContainText('再現：達成');
  await expect(app.locator('.comment-body img')).toHaveCount(1);

  // A17：実行は sandbox="allow-scripts" の iframe 内だけ。Host の DOM には要素として入らない
  await expect(page.locator('.preview-slot iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(page.locator('img[onerror]')).toHaveCount(0);

  // script タグだけ消しても onerror は残り、攻撃阻止にならない
  await verifyWith(page, 'script タグだけを削除する');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 20_000 });
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await expect(app.locator('.comment-body img')).toHaveCount(1);

  // コメントを出さないと、普通のコメントも読めない
  await verifyWith(page, 'コメントをすべて表示しない');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('普段の使い方が壊れています', { timeout: 20_000 });
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await expect(app.getByText(CAROL_COMMENT)).toHaveCount(0);
  await expect(app.getByText(ATTACK)).toHaveCount(0);

  // A09：文字として出せば、保存済みの攻撃コメントは動かず、普通のコメントは読める
  await verifyWith(page, 'コメントを文字として表示する');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await expect(app.getByText(ATTACK)).toBeVisible();
  await expect(app.getByText(CAROL_COMMENT)).toBeVisible();
  await expect(app.locator('.comment-body img')).toHaveCount(0);

  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: '保存したニックネームを、開いた人の画面で HTML として解釈している' }).check();
  await page.getByRole('radio', { name: '表示するときに textContent で文字として出す' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');
});
