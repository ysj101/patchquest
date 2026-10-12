// PoC: XSS演習用の隔離iframe（Issue #3）。結果は docs/poc/xss-isolation.md に記録する。
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const VETTED = '<img src="x" onerror="pqMarker()">';
const types = (events: { type: string }[]) => events.map((e) => e.type);

async function render(page: Page, ...args: Parameters<Window['pocXss']['render']>) {
  return page.evaluate((a) => window.pocXss.render(...a), args);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test/poc-xss.html');
  await page.waitForFunction(() => window.pocXss?.ready());
});

test.describe('本番想定のフレーム（ハッシュで許可したスクリプトのみ）', () => {
  test('危険なHTML解釈では、検証済みペイロードが実DOMで実行されマーカーが届く', async ({ page }) => {
    const { events } = await render(page, 'strict', 'html', [VETTED]);
    expect(types(events)).toContain('marker');
    // 画像の読み込み自体はCSPで止まり、通信は発生しない
    expect(events).toContainEqual(expect.objectContaining({ type: 'csp-violation', directive: 'img-src' }));
  });

  test('textContent での描画ではマーカーが発生せず、ペイロードが文字として表示される', async ({ page }) => {
    const { events } = await render(page, 'strict', 'text', [VETTED, '日本語 & <b>角括弧</b> "記号"']);
    expect(types(events)).not.toContain('marker');
    const items = page.frameLocator('iframe').first().locator('li');
    await expect(items).toHaveText([VETTED, '日本語 & <b>角括弧</b> "記号"']);
  });

  test('検証していないハンドラーやscript要素はCSPとHTMLの仕様で実行されない', async ({ page }) => {
    const { events } = await render(page, 'strict', 'html', [
      '<img src="x" onerror="pqMarker();">',
      '<svg onload="pqMarker()//"></svg>',
      '<script>pqMarker()</script>',
    ]);
    expect(types(events)).not.toContain('marker');
    expect(events).toContainEqual(expect.objectContaining({ type: 'csp-violation', directive: 'script-src-attr' }));
  });

  test('自由入力のmeta refreshは遷移ガードがなければフレームを遷移させ、ガードがあれば遷移しない', async ({ page }) => {
    const meta = '<meta http-equiv="refresh" content="0;url=./poc-xss-navigated.html">';
    const guarded = await render(page, 'strict', 'html', [meta, VETTED], true, 800);
    expect(guarded.loads).toBe(1);
    expect(types(guarded.events)).toContain('marker');

    const unguarded = await render(page, 'strict', 'html', [meta], false, 800);
    expect(unguarded.loads).toBe(2);
  });
});

test.describe('sandbox の隔離（任意のインラインスクリプトを許可したフレーム）', () => {
  const probe = (name: string, code: string) => `<img src="x" onerror="pqProbe('${name}', () => ${code.replaceAll('"', '&quot;')})">`;

  test('ホストのDOM・保存領域・Cookie・IndexedDBへアクセスできない', async ({ page }) => {
    const { events } = await render(page, 'loose', 'html', [
      probe('parent-dom', 'parent.document.getElementById("host-secret").textContent'),
      probe('parent-storage', 'parent.localStorage.getItem("pq-host-secret")'),
      probe('own-storage', 'localStorage.getItem("pq-host-secret")'),
      probe('cookie', 'document.cookie'),
      probe('indexeddb', 'indexedDB.open("pq")'),
    ]);
    const outcomes = Object.fromEntries(events.filter((e) => e.type === 'probe').map((e) => [e.name, e.outcome]));
    expect(outcomes).toEqual({
      'parent-dom': 'threw',
      'parent-storage': 'threw',
      'own-storage': 'threw',
      cookie: 'threw',
      indexeddb: 'threw',
    });
    expect(await page.evaluate(() => window.pocXss.hostSecret())).toBe('host-secret');
  });

  test('外部通信・ポップアップ・トップ遷移・フォーム送信・ダウンロードが起きない', async ({ page }) => {
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.url()));
    const hostUrl = await page.evaluate(() => window.pocXss.hostUrl());

    const { events, loads } = await render(
      page,
      'loose',
      'html',
      [
        probe('fetch', 'fetch("https://example.com/pq")'),
        probe('beacon', 'navigator.sendBeacon("https://example.com/pq")'),
        probe('image', '(new Image().src = "https://example.com/pq.gif")'),
        probe('popup', 'window.open("https://example.com/")'),
        probe('top-navigation', '(top.location.href = "https://example.com/")'),
        probe('form', '(() => { const f = document.createElement("form"); f.action = "./poc-xss.html?form"; document.body.append(f); f.submit(); })()'),
        probe('download', '(() => { const a = document.createElement("a"); a.href = "data:text/plain,x"; a.download = "x.txt"; document.body.append(a); a.click(); })()'),
      ],
      true,
      800,
    );
    const outcomes = Object.fromEntries(events.filter((e) => e.type === 'probe').map((e) => [e.name, [e.outcome, e.detail]]));
    expect(outcomes.fetch).toEqual(['threw', 'TypeError']);
    expect(outcomes.popup).toEqual(['returned', 'null']);
    expect(outcomes['top-navigation']?.[0]).toBe('threw');
    expect(events).toContainEqual(expect.objectContaining({ type: 'csp-violation', directive: 'connect-src' }));
    expect(loads).toBe(1);
    expect(downloads).toEqual([]);
    expect(await page.evaluate(() => window.pocXss.hostUrl())).toBe(hostUrl);
    // localhost以外への通信が発生していないことは fixtures の externalRequests で検査する
  });

  test('ホストは送信元ウィンドウ・スキーマ・実行IDが一致しないメッセージを捨てる', async ({ page }) => {
    await render(page, 'loose', 'html', [
      `<img src="x" onerror="parent.postMessage({ type: 'marker', runId: 'guessed' }, '*'); parent.postMessage('garbage', '*')">`,
    ]);
    await page.evaluate(() => window.pocXss.forgeFromHost('strict'));
    const stale = await page.evaluate(() => window.pocXss.renderTwice('strict', ['a']));
    expect(stale.events.every((e) => e.runId === stale.current)).toBe(true);

    const reasons = (await page.evaluate(() => window.pocXss.rejected())).map((r) => r.reason);
    expect(reasons).toEqual(expect.arrayContaining(['stale-run', 'schema', 'unknown-source']));
    expect(reasons.filter((r) => r === 'stale-run').length).toBeGreaterThanOrEqual(2);
  });
});
