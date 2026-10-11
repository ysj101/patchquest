// PoC: Worker上のSQLite WASM（Issue #2）。計測値は docs/poc/sqlite-wasm.md に記録する。
import { expect, test } from './fixtures';

type SearchResult = { sql: string; bind: unknown[]; rows: { owner_id: number; title: string }[]; owners: number[] };

test.beforeEach(async ({ page }) => {
  await page.goto('/test/poc-sqlite.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('冷キャッシュのlocalhostからWorker上でメモリDBを起動できる', async ({ page, browserName }, testInfo) => {
  const wasm = page.waitForResponse((r) => r.url().endsWith('/sqlite3.wasm'));
  const timing = await page.evaluate(() => window.poc.start());
  const res = await wasm;
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/wasm');
  expect(await page.evaluate(() => window.poc.count())).toBe(5);
  testInfo.annotations.push({ type: 'cold-start', description: JSON.stringify({ project: testInfo.project.name, browserName, ...timing }) });
  console.log(`[cold-start] ${testInfo.project.name}: total=${timing.totalMs.toFixed(0)}ms init=${timing.initMs.toFixed(0)}ms`);
  expect(timing.totalMs).toBeLessThan(5000);
});

test('クエリ形・バインド値・返却行の所有者を観測でき、文字列結合では所有者条件を迂回できる', async ({ page }) => {
  await page.evaluate(() => window.poc.start());
  const attack = "x' OR 1=1 --";

  const concat = (await page.evaluate((q) => window.poc.search('concat', 1, q), attack)) as SearchResult;
  expect(concat.sql).toContain(attack);
  expect(concat.bind).toEqual([]);
  expect(concat.owners).toContain(2);

  const param = (await page.evaluate((q) => window.poc.search('param', 1, q), attack)) as SearchResult;
  expect(param.sql).not.toContain(attack);
  expect(param.bind).toEqual([1, `%${attack}%`]);
  expect(param.rows).toEqual([]);
});

test('パラメーター化クエリは日本語・引用符・該当なしを正しく扱う', async ({ page }) => {
  await page.evaluate(() => window.poc.start());
  const search = (q: string) => page.evaluate((q) => window.poc.search('param', 1, q), q) as Promise<SearchResult>;

  expect((await search('メモ')).rows.map((r) => r.title)).toEqual(['買い物メモ', '会議メモ']);
  expect((await search("O'Reilly")).rows.map((r) => r.title)).toEqual(["O'Reilly の本"]);
  expect((await search('存在しない語')).rows).toEqual([]);
  expect((await search('日記')).rows).toEqual([]);
  // 文字列結合では引用符を含む正常な検索が構文エラーになる
  await expect(page.evaluate(() => window.poc.search('concat', 1, "O'Reilly"))).rejects.toThrow(/syntax error/);
});

test('終わらないクエリをタイムアウトで停止し、新しいWorkerで初期状態のDBを作り直せる', async ({ page }) => {
  await page.evaluate(() => window.poc.start());
  await page.evaluate(() => window.poc.insert(1, '追加したメモ'));
  expect(await page.evaluate(() => window.poc.count())).toBe(6);

  const busy = await page.evaluate(() => window.poc.busy(1000));
  expect(busy.timedOut).toBe(true);
  expect(busy.elapsedMs).toBeLessThan(1500);
  await expect(page.evaluate(() => window.poc.count())).rejects.toThrow();

  const restart = await page.evaluate(() => window.poc.start());
  console.log(`[restart] total=${restart.totalMs.toFixed(0)}ms init=${restart.initMs.toFixed(0)}ms`);
  expect(await page.evaluate(() => window.poc.count())).toBe(5);
});
