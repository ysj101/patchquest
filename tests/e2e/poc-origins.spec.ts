// PoC（Issue #233）：同じ配布物を 127.0.0.1 と localhost の 2 つのオリジンで開き、Cookie・SameSite・CORS が本物として働く範囲を確かめる。記録は docs/poc/cross-origin-cookies.md
// 共通のフィクスチャ（fixtures.ts）は baseURL 以外のオリジンへの通信を止めるので使わず、2 つのオリジン以外への通信がないことを、このファイルで確かめる
import { test as base, expect, type CDPSession, type Page } from '@playwright/test';

const PAGE = '/test/poc-origins.html';
/** 文書から見える Cookie。HttpOnly と、Secure のない SameSite=None は、付けようとしても付かない */
const ALL_COOKIES = 'strict=1; lax=1; none=1; unset=1';

interface Origins {
  /** 教材アプリの役（Cookie を持つ側）。http://127.0.0.1:<ポート> */
  app: string;
  /** わなのページの役（別のサイト）。http://localhost:<ポート> */
  trap: string;
  /** URL が mark を含むリクエストに、Chrome が実際に付けて送った Cookie ヘッダ。Service Worker が答えたリクエストには記録がない */
  sentCookie(mark: string): Promise<string>;
  /** URL が mark を含む応答の、ステータス・Service Worker が答えたか・Access-Control-Allow-Origin */
  response(mark: string): Promise<SeenResponse>;
}

interface SeenResponse {
  status: number;
  viaServiceWorker: boolean;
  allowOrigin: string | null;
}

/**
 * DevTools と同じ経路（CDP の Network）で、リクエストと応答を覚える。
 * Playwright の allHeaders は、中身を読めない応答（no-cors）のリクエストでは Cookie を落とすことがあるので使わない
 */
async function watch(cdp: CDPSession): Promise<Pick<Origins, 'sentCookie' | 'response'>> {
  const urls = new Map<string, string>();
  const cookies = new Map<string, string>();
  const responses = new Map<string, SeenResponse>();
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => urls.set(requestId, request.url));
  cdp.on('Network.requestWillBeSentExtraInfo', ({ requestId, headers }) => cookies.set(requestId, headers.Cookie ?? ''));
  cdp.on('Network.responseReceived', ({ response }) =>
    responses.set(response.url, { status: response.status, viaServiceWorker: response.fromServiceWorker === true, allowOrigin: response.headers['Access-Control-Allow-Origin'] ?? null }),
  );
  await cdp.send('Network.enable');
  /** 条件に合う記録が現れるまで待って返す */
  const found = async <Value>(mark: string, read: () => Value | undefined): Promise<Value> => {
    await expect.poll(read, `${mark} を含む URL の記録（見えた URL：${[...urls.values()].join(' ')}）`).toBeDefined();
    const value = read();
    if (value === undefined) throw new Error(`${mark} を含む URL の記録がありません`);
    return value;
  };
  return {
    sentCookie: (mark) => found(mark, () => [...urls].filter(([, url]) => url.includes(mark)).map(([id]) => cookies.get(id)).find((cookie) => cookie !== undefined)),
    response: (mark) => found(mark, () => [...responses].find(([url]) => url.includes(mark))?.[1]),
  };
}

const test = base.extend<{ origins: Origins }>({
  origins: async ({ page, context, baseURL }, use) => {
    if (baseURL === undefined) throw new Error('baseURL がありません');
    const app = new URL(baseURL).origin;
    const trap = app.replace('127.0.0.1', 'localhost');
    const seen = new Set<string>();
    context.on('request', (request) => seen.add(new URL(request.url()).origin));
    const watching = await watch(await context.newCDPSession(page));
    // 教材アプリの役のオリジンで、文書のスクリプトから Cookie を付け、保存領域に書く
    await page.goto(app + PAGE);
    await page.evaluate(async () => {
      for (const cookie of ['strict=1; SameSite=Strict', 'lax=1; SameSite=Lax', 'none=1; SameSite=None; Secure', 'insecure=1; SameSite=None', 'unset=1', 'httponly=1; HttpOnly']) document.cookie = `${cookie}; path=/`;
      localStorage.setItem('pq-poc', 'app');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('pq-poc', 1);
        request.onsuccess = resolve;
        request.onerror = reject;
      });
    });
    await use({ app, trap, ...watching });
    expect([...seen].filter((origin) => origin !== app && origin !== trap), '2 つのオリジン以外への通信が発生した').toEqual([]);
  },
});

/** わなのページから、教材アプリの役のオリジンへフォームを送る（画面ごと移動する） */
async function submitForm(page: Page, action: string): Promise<void> {
  await page.evaluate((url) => {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = url;
    const input = document.createElement('input');
    input.name = 'memo';
    input.value = 'changed';
    form.append(input);
    document.body.append(form);
    form.submit();
  }, action);
  await page.waitForURL(action);
}

test('文書のスクリプトで付けられる Cookie は、SameSite の 3 通りと指定なし。HttpOnly は付かない', async ({ page, origins }) => {
  expect(await page.evaluate(() => document.cookie)).toBe(ALL_COOKIES);
  // 同じサイトの中のリクエストには、すべて付く
  await page.evaluate(() => fetch('?same'));
  expect(await origins.sentCookie('?same')).toBe(ALL_COOKIES);
});

test('保存領域は分かれる：localhost で開くと、127.0.0.1 の Cookie・localStorage・IndexedDB は見えず、文書も読めない', async ({ page, origins }) => {
  await page.goto(origins.trap + PAGE);

  const seen = await page.evaluate(async (url) => {
    const frame = document.createElement('iframe');
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = url;
      document.body.append(frame);
    });
    return { cookie: document.cookie, storage: localStorage.getItem('pq-poc'), databases: (await indexedDB.databases()).map((database) => database.name), frame: frame.contentDocument === null ? '読めない' : '読めた' };
  }, `${origins.app}${PAGE}?frame`);

  expect(seen).toEqual({ cookie: '', storage: null, databases: [], frame: '読めない' });
});

test('別サイト（localhost）のページの中から 127.0.0.1 へ送るリクエストには、SameSite=None の Cookie だけが付く', async ({ page, origins }) => {
  await page.goto(origins.trap + PAGE);
  const target = origins.app + PAGE;

  await page.evaluate(async (url) => {
    await fetch(`${url}?fetch`, { mode: 'no-cors', credentials: 'include' });
    await fetch(`${url}?post`, { method: 'POST', mode: 'no-cors', credentials: 'include', body: new URLSearchParams({ memo: 'changed' }) });
    await new Promise((resolve) => {
      const image = new Image();
      image.onerror = resolve;
      image.src = `${url}?image`;
    });
    await new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.onload = resolve;
      frame.src = `${url}?frame`;
      document.body.append(frame);
    });
  }, target);

  for (const mark of ['?fetch', '?post', '?image', '?frame']) expect(await origins.sentCookie(mark), mark).toBe('none=1');
});

test('別サイトからの画面ごとの移動（GET）には Strict 以外が付く。移動先の文書からは Strict も見えるので、文書の側では見分けられない', async ({ page, origins }) => {
  await page.goto(origins.trap + PAGE);

  // page.goto は利用者がアドレスを打ったのと同じ扱いになるので、わなのページのスクリプトから移動する
  await page.evaluate((url) => {
    location.href = url;
  }, `${origins.app}${PAGE}?script`);
  await page.waitForURL(/\?script$/);

  expect(await origins.sentCookie('?script')).toBe('lax=1; none=1; unset=1');
  expect(await page.evaluate(() => document.cookie)).toBe(ALL_COOKIES);
});

test('別サイトからのフォームの POST には、None と、付けて間もない指定なしの Cookie が付く。静的サーバは POST を処理しない（501）', async ({ page, origins }) => {
  await page.goto(origins.trap + PAGE);

  await submitForm(page, `${origins.app}${PAGE}?form`);

  expect(await origins.sentCookie('?form')).toBe('none=1; unset=1');
  expect(await origins.response('?form')).toEqual({ status: 501, viaServiceWorker: false, allowOrigin: null });
});

test('Service Worker は別サイトからの POST を受け取れるが、Cookie は見えない。応答の文書からは Strict も見える', async ({ page, origins }) => {
  // #232 の PoC の Service Worker を、教材アプリの役のオリジンに登録する
  await page.goto(`${origins.app}/test/poc-sw.html`);
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await page.goto(origins.trap + PAGE);
  const scope = `${origins.app}/test/poc-sw/a/`;

  // わなのページの中からの取得は、相手のオリジンの Service Worker を通らない（静的サーバの 404）
  await page.evaluate((url) => fetch(url, { mode: 'no-cors', credentials: 'include' }), `${scope}api?fetch`);
  expect(await origins.response('api?fetch')).toEqual({ status: 404, viaServiceWorker: false, allowOrigin: null });

  // 画面ごとの移動は Service Worker が受け取る
  await submitForm(page, `${scope}echo`);
  expect(await origins.response('/echo')).toMatchObject({ status: 200, viaServiceWorker: true });
  const seen = await page.evaluate(async () => ({
    received: decodeURIComponent(document.body.dataset.note ?? ''),
    cookieInServiceWorker: ((await (await fetch('api')).json()) as { cookie: string | null }).cookie,
    cookieInDocument: document.cookie,
  }));
  expect(seen).toEqual({ received: 'POST memo=changed', cookieInServiceWorker: null, cookieInDocument: ALL_COOKIES });
});

test('CORS：静的サーバは Access-Control-Allow-Origin を返さないので、別オリジンからの取得は読めない', async ({ page, origins }) => {
  await page.goto(origins.trap + PAGE);

  const result = await page.evaluate(
    (url) =>
      fetch(url, { credentials: 'include' }).then(
        () => '読めた',
        (error: unknown) => (error instanceof Error ? error.name : String(error)),
      ),
    `${origins.app}${PAGE}?cors`,
  );

  expect(result).toBe('TypeError');
  // 読めない応答を DevTools の経路で見ると、サーバは 200 を返していて、許可のヘッダがない
  await page.evaluate((url) => fetch(url, { mode: 'no-cors' }), `${origins.app}${PAGE}?opaque`);
  expect(await origins.response('?opaque')).toEqual({ status: 200, viaServiceWorker: false, allowOrigin: null });
});
