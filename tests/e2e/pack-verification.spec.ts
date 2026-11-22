// パック出荷前検証（pnpm run verify:packs）。カタログのすべてのパックが、どの seed でも基準・レシピ・対策の期待どおりかを確かめる
import { MACHINE, expect, openTestPage, test } from './fixtures';

test('カタログのすべてのパックが出荷前検証に合格する', MACHINE, async ({ page }) => {
  test.setTimeout(600_000);
  await openTestPage(page, 'pack-verification');
  const started = Date.now();
  const results = await page.evaluate(() => window.verifyAllPacks());
  // 所要時間を記録に残す（Issue #171。CI のログで見る）
  console.log(`出荷前検証の所要時間：${((Date.now() - started) / 1000).toFixed(0)} 秒`);
  for (const result of results) {
    console.log(`[${result.ok ? 'OK' : 'NG'}] ${result.packId}（seed ${result.seed}）`);
    for (const check of result.checks) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`);
  }
  expect(results.length).toBeGreaterThan(0);
  expect(results.filter((r) => !r.ok).map((r) => `${r.packId}（seed ${r.seed}）`)).toEqual([]);
});
