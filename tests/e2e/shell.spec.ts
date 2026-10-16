import { expect, test, openHome } from './fixtures';

test('ビルド成果物をlocalhostから開くと課題一覧が表示される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await openHome(page);

  expect(errors).toEqual([]);
});
