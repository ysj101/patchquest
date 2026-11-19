// パック出荷前検証（pnpm run verify:packs）。カタログのすべてのパックが、どの seed でも基準・レシピ・対策の期待どおりかを確かめる
import { expect, openTestPage, test } from './fixtures';

test('カタログのすべてのパックが出荷前検証に合格する', async ({ page }) => {
  test.setTimeout(240_000);
  await openTestPage(page, 'pack-verification');
  const results = await page.evaluate(() => window.verifyAllPacks());
  for (const result of results) {
    console.log(`[${result.ok ? 'OK' : 'NG'}] ${result.packId}（seed ${result.seed}）`);
    for (const check of result.checks) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`);
  }
  expect(results.length).toBeGreaterThan(0);
  expect(results.filter((r) => !r.ok).map((r) => `${r.packId}（seed ${r.seed}）`)).toEqual([]);
});
