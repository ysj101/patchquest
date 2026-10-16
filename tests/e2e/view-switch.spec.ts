// 利用者の表示切り替えと初期表示が競合しても、最後に選んだ利用者の画面が表示され、画面内の移動ができる（#97）。
import { expect, openHome, preview, startMission, test } from './fixtures';

test('初期表示の直後に利用者を切り替えても、その利用者の画面が表示され移動できる', async ({ page }) => {
  await startMission(page, 'idor');
  const app = preview(page);

  // 初期表示（alice）が終わるか終わらないかのうちに bob へ切り替える
  await page.getByRole('radio', { name: 'bob' }).check();
  await expect(app.getByText('bob さんとしてログイン中')).toBeVisible();

  // 切り替えた直後でも、プレビュー内の移動が効く（古い描画に上書きされない）
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await expect(app.getByRole('heading', { name: '共有ページ' })).toBeVisible();
});

test('続けて利用者を切り替えると、最後に選んだ利用者だけが表示される', async ({ page }) => {
  await openHome(page);
  await startMission(page, 'idor');
  const app = preview(page);

  // bob を選んだ直後に carol へ切り替える。最後の要求（carol）が反映される
  await page.getByRole('radio', { name: 'bob' }).check();
  await page.getByRole('radio', { name: 'carol' }).check();
  await expect(app.getByText('carol さんとしてログイン中')).toBeVisible();
  await expect(app.getByText('bob さんとしてログイン中')).toHaveCount(0);
});
