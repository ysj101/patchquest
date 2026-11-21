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

test('演習用の機械に入っているソフトウェアの一覧・ソースコードの入手先・ライセンスの全文が同梱されている', async ({ request }) => {
  const legal = await request.get('/assets/linux-machine.LEGAL.txt');
  expect(legal.status()).toBe(200);
  const text = await legal.text();
  expect(text).toContain('■ Linux カーネル 6.18.64（Alpine Linux の linux-virt）\n  ライセンス：GPL-2.0-only');
  expect(text).toContain('https://github.com/ysj101/patchquest/releases/tag/machine-sources-1');
  expect(text).toContain('GNU GENERAL PUBLIC LICENSE\n\t\t       Version 2, June 1991');
  // README からも、同じ場所とファイルを案内する
  const readme = await (await request.get('/README.md')).text();
  expect(readme).toContain('assets/linux-machine.LEGAL.txt');
  expect(readme).toContain('https://github.com/ysj101/patchquest/releases/tag/machine-sources-1');
});
