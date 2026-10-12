import { expect, test } from './fixtures';

test('ビルド成果物をlocalhostから開くと課題一覧が表示される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'わざと壊したアプリで、こわして、なおして、たしかめる。' })).toBeVisible();
  expect(errors).toEqual([]);
});
