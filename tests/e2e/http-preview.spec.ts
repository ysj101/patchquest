// 画面を HTTP 応答として出す教材アプリ（必要機能 http、Issue #232）。Service Worker が返す応答を Chrome が本物の HTTP 応答として扱うことと、
// 枠の中の文書が学習UI・保存領域・外部へ届かないこと（spec §14）を、製品の課題（open-redirect）の画面で確かめる
import type { Frame, Page, Response } from '@playwright/test';
import { expect, preview, startMission, test } from './fixtures';

const address = (page: Page) => page.getByRole('textbox', { name: 'アドレス' });
/** 教材アプリの置き場所（インスタンスごとのパス） */
const MOUNT = /^\/assets\/http\/[a-z0-9]+/;

async function appFrame(page: Page): Promise<Frame> {
  const frame = await (await page.locator('.preview-slot iframe').elementHandle()).contentFrame();
  if (!frame) throw new Error('教材アプリの枠がありません');
  return frame;
}

/** アドレス欄からサインインの画面を開き、サインインのフォームを送る */
async function signIn(page: Page, next: string): Promise<void> {
  await address(page).fill(`/login?next=${next}`);
  await address(page).press('Enter');
  await preview(page).getByRole('button', { name: 'bob としてサインインする' }).click();
}

/** 応答を、リクエスト・ステータス・Service Worker が返したか・Location・ポリシーにまとめる。置き場所（/assets/http/<インスタンス>）は伏せる */
function summarize(response: Response) {
  const { pathname, search } = new URL(response.url());
  const headers = response.headers();
  return {
    request: `${response.request().method()} ${pathname.replace(MOUNT, '')}${search}`,
    status: response.status(),
    fromServiceWorker: response.fromServiceWorker(),
    location: headers.location?.replace(MOUNT, '（置き場所）'),
    policy: headers['content-security-policy'],
  };
}

test('Service Worker が返した応答は、Chrome の開発者ツールの経路（DevTools プロトコル）で、ステータスとヘッダを持つ本物の応答として見える', async ({ page }) => {
  await startMission(page, 'open-redirect');
  await expect(preview(page).getByRole('heading', { name: 'お知らせ' })).toBeVisible();
  // 枠の中の文書は別のプロセスで動くので、Playwright が枠ごとに DevTools プロトコルから受け取った応答を集める
  const responses: Response[] = [];
  page.on('response', (response) => {
    if (MOUNT.test(new URL(response.url()).pathname)) responses.push(response);
  });

  // リダイレクトの応答は、枠のプロセスにつないだ DevTools プロトコルの Network で見る（開発者ツールの Network タブと同じ情報）
  const cdp = await page.context().newCDPSession(await appFrame(page));
  await cdp.send('Network.enable');
  const redirects: unknown[] = [];
  cdp.on('Network.requestWillBeSent', ({ redirectResponse }) => {
    if (!redirectResponse) return;
    redirects.push({
      request: `POST ${new URL(redirectResponse.url).pathname.replace(MOUNT, '')}`,
      status: redirectResponse.status,
      fromServiceWorker: redirectResponse.fromServiceWorker,
      location: String(redirectResponse.headers.location).replace(MOUNT, '（置き場所）'),
    });
  });

  await signIn(page, '/?from=mail');
  await expect(preview(page).getByRole('button', { name: 'サインアウト' })).toBeVisible();
  await expect(address(page)).toHaveValue('/?from=mail');

  // サインインの画面と、サインインのあとに開いた画面。どちらにも隔離のポリシーが付いている
  const policy = "sandbox allow-forms; default-src 'none'; style-src 'unsafe-inline'";
  const common = { fromServiceWorker: true, policy };
  const documents = responses.filter((response) => response.status() === 200);
  expect(documents.map(summarize)).toEqual([
    { request: 'GET /login?next=/?from=mail', status: 200, location: undefined, ...common },
    { request: 'GET /?from=mail', status: 200, location: undefined, ...common },
  ]);
  // あとの画面は、サインインの応答（302）に従って開いたもの。Location には、教材アプリの置き場所が前に付いている
  expect(redirects).toEqual([{ request: 'POST /login', status: 302, fromServiceWorker: true, location: '（置き場所）/?from=mail' }]);
});

test('隔離：枠の中の文書は不透明なオリジンになり、学習UIの DOM・保存領域に届かない。枠の中でスクリプトは動かない', async ({ page }) => {
  await startMission(page, 'open-redirect');
  // 枠に sandbox 属性は付けていない（付けると Service Worker を通らない）。隔離は応答のヘッダが担う
  await expect(page.locator('.preview-slot iframe')).not.toHaveAttribute('sandbox');
  await expect(preview(page).getByRole('heading', { name: 'お知らせ' })).toBeVisible();
  const frame = await appFrame(page);

  // 検査用の式は、ページのスクリプトとは別の経路（開発者ツールと同じ）で評価する。文書のオリジンと、そこから届く範囲を見る
  const reach = await frame.evaluate(() => {
    const attempt = (work: () => unknown): string => {
      try {
        return String(work());
      } catch (error) {
        return `threw:${error instanceof Error ? error.name : String(error)}`;
      }
    };
    return {
      origin: self.origin,
      parentDom: attempt(() => parent.document.title),
      parentStorage: attempt(() => parent.localStorage.length),
      ownStorage: attempt(() => localStorage.length),
      cookie: attempt(() => document.cookie),
      serviceWorker: attempt(() => navigator.serviceWorker.controller),
    };
  });
  expect(reach).toEqual({
    origin: 'null',
    parentDom: 'threw:SecurityError',
    parentStorage: 'threw:SecurityError',
    ownStorage: 'threw:SecurityError',
    cookie: 'threw:SecurityError',
    serviceWorker: 'threw:SecurityError',
  });

  // 文書に入れたスクリプトは動かない（sandbox に allow-scripts がない）
  const ran = await frame.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.body.dataset.ran = "yes"';
    // 許可されていれば、入れた時点で動く
    document.body.append(script);
    return document.body.dataset.ran ?? 'no';
  });
  expect(ran).toBe('no');

  // 学習UIのページは、Service Worker の受け持つ範囲の外にある
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
});

test('外のサイトへ移動させる応答に、ブラウザは従おうとするが、通信は起きない（学習UIの CSP が止める）', async ({ page, externalRequests }) => {
  await startMission(page, 'open-redirect');
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('frame-src')) blocked.push(message.text());
  });

  await signIn(page, 'https://evil.example/login');
  await expect(page.locator('.preview-slot .http-external')).toContainText('教材アプリの外へ移動するところでした');

  // ブラウザは Location のアドレスへ移動しようとして、学習UIの frame-src 'self' に止められた。外への要求は出ていない
  await expect.poll(() => blocked).toEqual([expect.stringContaining("Framing 'https://evil.example/' violates")]);
  expect(externalRequests).toEqual([]);
});

test('Service Worker が止まっても、次の操作で起動し直して続けられる（状態は Service Worker に置いていない）', async ({ page }) => {
  await startMission(page, 'open-redirect');
  await signIn(page, '/');
  await expect(preview(page).getByRole('button', { name: 'サインアウト' })).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');

  // サインインした状態は、止まる前のまま残っている
  await preview(page).getByRole('listitem').getByRole('link').first().click();
  await expect(preview(page).getByRole('link', { name: 'お知らせの一覧へ戻る' })).toBeVisible();
  await expect(address(page)).toHaveValue(/^\/notices\/\d+$/);
});

test('画面を隔離 iframe に描く課題と、HTTP 応答として出す課題を行き来しても、それぞれの枠で開く', async ({ page }) => {
  await startMission(page, 'open-redirect');
  await expect(preview(page).getByRole('heading', { name: 'お知らせ' })).toBeVisible();

  await page.getByRole('button', { name: /課題一覧へ戻る$/ }).first().click();
  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }).click();
  await expect(page.locator('.exercise')).toBeVisible();
  await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();
  await expect(page.locator('.preview-slot iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(page.locator('.preview-slot .http-preview')).toHaveCount(0);
  await expect(preview(page).getByRole('heading', { name: /^ノート/ })).toBeVisible();
});
