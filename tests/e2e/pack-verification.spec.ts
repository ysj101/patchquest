// パック出荷前検証（pnpm run verify:packs。CI では main へのマージ後に、パックごとに別のランナーで走らせる）。検証対象のパックごとに 1 件のテストを作り、
// そのパックがどの seed でも基準・レシピ・対策の期待どおりかを確かめる。テストの一覧は検証対象（tests/support/verification-catalog.ts）から作るので、
// パックを足すとテストも CI のジョブも自動で増える
import { verificationCatalog } from '../support/verification-catalog';
import { MACHINE, expect, openTestPage, test } from './fixtures';

/** パックごとのテストの題名の先頭。CI は題名でパックごとのジョブに分ける（scripts/verify-packs-matrix.mjs） */
const TITLE_PREFIX = '出荷前検証：';

for (const { manifest } of verificationCatalog.packs) {
  test(`${TITLE_PREFIX}${manifest.id}`, MACHINE, async ({ page }) => {
    // テストの上限は置かない。遅いだけなら最後まで走らせ、固まったときは CI のジョブの timeout-minutes で止まる
    test.setTimeout(0);
    await openTestPage(page, 'pack-verification');
    const started = Date.now();
    const results = await page.evaluate((packId) => window.verifyPackById(packId), manifest.id);
    // 所要時間を記録に残す（Issue #171, #219。CI のログで見る）
    console.log(`出荷前検証の所要時間（${manifest.id}）：${((Date.now() - started) / 1000).toFixed(0)} 秒`);
    for (const result of results) {
      console.log(`[${result.ok ? 'OK' : 'NG'}] ${result.packId}（seed ${result.seed}）`);
      for (const check of result.checks) console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`);
    }
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => !r.ok).map((r) => `${r.packId}（seed ${r.seed}）`)).toEqual([]);
  });
}
