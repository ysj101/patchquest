// PoC（Issue #232）：Service Worker が返す応答を、Chrome が本物の HTTP 応答として扱う範囲を確かめる。記録は docs/poc/service-worker-http.md
import type { Page } from '@playwright/test';
import { expect, openTestPage, test } from './fixtures';

type OpenArgs = Parameters<Window['pocSw']['open']>;
/** スコープの下の URL を枠で開き、枠の中の調査が知らせた内容（スクリプトが動かなければ null）と、Host から読めた題名を得る */
const open = (page: Page, ...args: OpenArgs) => page.evaluate((openArgs) => window.pocSw.open(...openArgs), args);

const HOST_TITLE = 'PoC: Service Worker の HTTP 応答';
const SANDBOX = { 'content-security-policy': 'sandbox allow-scripts allow-forms' };

/** Service Worker が受け持つ、Host と同じオリジンの文書の中から見えるもの */
const sameOrigin = (instance: string, cookie = '') => ({
  url: 'doc',
  note: '',
  origin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
  storage: 'true',
  parentDom: HOST_TITLE,
  cookie,
  controlled: 'true',
  api: ['200:{"hits":1,"cookie":null}', '200:{"hits":2,"cookie":null}'],
  relay: `200:Host が ${instance}/relay に答えた`,
  script: 'loaded',
});

/** 応答の CSP sandbox で不透明なオリジンになった文書の中から見えるもの */
const isolated = {
  origin: 'null',
  storage: 'threw:SecurityError',
  parentDom: 'threw:SecurityError',
  cookie: 'threw:SecurityError',
  controlled: 'threw:SecurityError',
  api: ['threw:TypeError', 'threw:TypeError'],
  relay: 'threw:TypeError',
  script: 'error',
};

test.beforeEach(async ({ page }) => {
  await openTestPage(page, 'poc-sw');
});

test('Service Worker が作った応答は、DevTools と同じ経路（CDP）で、ステータスとヘッダを持つ応答として見える', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const seen: unknown[] = [];
  cdp.on('Network.responseReceived', ({ response }) => {
    if (response.url.endsWith('/poc-sw/a/api?cc=max-age%3D600')) seen.push({ status: response.status, fromServiceWorker: response.fromServiceWorker, cache: response.headers['cache-control'] });
  });

  await open(page, 'a/doc');

  const viaServiceWorker = { status: 200, fromServiceWorker: true, cache: 'max-age=600' };
  expect(seen).toEqual([viaServiceWorker, viaServiceWorker]);
});

test('応答の CSP・X-Frame-Options・frame-ancestors を、Chrome が枠の文書に強制する', async ({ page }) => {
  // スクリプトを禁じた文書は開けるが、中のスクリプトは動かない
  expect(await open(page, 'a/doc', { headers: { 'content-security-policy': "script-src 'none'" } })).toEqual({ report: null, title: 'PoC 文書' });
  // 枠に入れることを禁じた文書は、枠に出ない
  expect(await open(page, 'a/doc', { headers: { 'x-frame-options': 'DENY' } })).toEqual({ report: null, title: '読めない' });
  expect(await open(page, 'a/doc', { headers: { 'content-security-policy': "frame-ancestors 'none'" } })).toEqual({ report: null, title: '読めない' });
});

test('応答の Set-Cookie は効かず、ページが付けた Cookie も Service Worker には届かない', async ({ page }) => {
  await page.evaluate(() => {
    document.cookie = 'pq=js; path=/';
  });

  const { report } = await open(page, 'a/doc', { headers: { 'set-cookie': 'pq=sw; path=/' } });

  // 文書から見える Cookie はページが付けたものだけ。api が見たリクエストの Cookie は null
  expect(report).toEqual(sameOrigin('a', 'pq=js'));
});

test('応答はブラウザの HTTP キャッシュに入らず、インスタンスごとの状態は分かれ、リダイレクトにはブラウザが従う', async ({ page }) => {
  // max-age を付けた api を 2 回取得しても、2 回とも Service Worker に届く（hits が 1 → 2）
  expect((await open(page, 'a/doc')).report).toEqual(sameOrigin('a'));
  // 別のインスタンスの回数は 1 から始まる。302 の行き先（doc）が開く
  expect((await open(page, 'b/redirect?to=doc')).report).toEqual(sameOrigin('b'));
});

test('隔離：そのまま開いた文書は Host と同じオリジンになり、Host の保存領域と DOM に届いてしまう', async ({ page }) => {
  const { report, title } = await open(page, 'a/doc');

  expect(report).toMatchObject({ storage: 'true', parentDom: HOST_TITLE });
  expect(title).toBe('PoC 文書');
});

test('隔離：sandbox 属性を付けた枠への移動は Service Worker を通らず、静的サーバの 404 になる', async ({ page }) => {
  const statuses: number[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('/poc-sw/a/doc')) statuses.push(response.status());
  });

  expect(await open(page, 'a/doc', { sandbox: 'allow-scripts' })).toEqual({ report: null, title: '読めない' });
  expect(statuses).toEqual([404]);
});

test('隔離：応答の CSP sandbox で開いた文書は Host に届かない。取得とスクリプトの読み込みは通らないが、フォームの送信は Service Worker に届く', async ({ page }) => {
  const direct = await open(page, 'a/doc', { headers: SANDBOX });
  expect(direct).toEqual({ report: { url: 'doc', note: '', ...isolated }, title: '読めない' });

  // フォームの文書が自分で POST し、移動先の文書を Service Worker が作る。note は Service Worker が受け取ったメソッドと本文
  const posted = await open(page, 'a/form', { headers: SANDBOX });
  expect(posted).toEqual({ report: { url: 'echo', note: 'POST memo=hello', ...isolated }, title: '読めない' });
});

test('Host（スコープの外のページ）からの取得は Service Worker を通らない', async ({ page }) => {
  expect(await page.evaluate(() => window.pocSw.fetchFromHost('a/api'))).toBe(404);
});

test('Service Worker が止まるとメモリの状態は消えるが、次のリクエストで起動し直し、Host への問い合わせも続けられる', async ({ page }) => {
  expect((await open(page, 'a/doc')).report).toEqual(sameOrigin('a'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  // 回数が 1 に戻っている（止まる前は 2 まで進んでいた）
  expect((await open(page, 'a/doc')).report).toEqual(sameOrigin('a'));
});
