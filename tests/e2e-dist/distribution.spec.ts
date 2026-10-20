// 配布物の確認（Issue #14）。外部ネットワークを遮断し、新しいブラウザ環境（冷えたキャッシュ）で開く
import { expect, test } from '../e2e/fixtures';

test('展開した配布物を localhost で開くと課題一覧が表示され、エラーが出ない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'PatchQuest', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('演習に必要なファイルがすべて同梱され、検証用のページは含まれない', async ({ page, request }) => {
  await page.goto('/');
  for (const path of ['/assets/main.js', '/assets/styles.css', '/assets/runtime-worker.js', '/assets/preview.html', '/README.md']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  for (const path of ['/assets/avatars/patch.svg', '/assets/avatars/patch-done.svg', '/assets/avatars/requester.svg']) {
    const avatar = await request.get(path);
    expect(avatar.status(), path).toBe(200);
    expect(avatar.headers()['content-type'], path).toBe('image/svg+xml');
  }
  const wasm = await request.get('/assets/sqlite3.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toBe('application/wasm');
  expect((await request.get('/test/runtime.html')).status()).toBe(404);
});
