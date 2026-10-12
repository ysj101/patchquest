// ブラウザ用 RuntimeAdapter の契約テスト（Issue #5）
import type { Page } from '@playwright/test';
import type { FixtureData, InvokeResult, PrepareOptions } from '../../platform/contract';
import { expect, test } from './fixtures';

type Name = 'exercise' | 'verifier';
type Settled<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

const options = (seed: number, implementations: Record<string, string> = {}): PrepareOptions => ({
  attemptId: `attempt-${seed}`,
  app: { id: 'test-app', version: '1.0.0' },
  fixture: { generator: 'test.default', seed },
  implementations,
});

function call<T>(page: Page, name: Name, method: string, ...args: unknown[]): Promise<Settled<T>> {
  return page.evaluate(([n, m, a]) => window.runtimeTest.call(n, m, ...a), [name, method, args] as const) as Promise<Settled<T>>;
}

async function ok<T>(page: Page, name: Name, method: string, ...args: unknown[]): Promise<T> {
  const result = await call<T>(page, name, method, ...args);
  if (!result.ok) throw new Error(`${method}: ${result.code} ${result.message}`);
  return result.value;
}

/** セッションを発行してリクエストを送る */
async function request(page: Page, name: Name, actor: string, method: string, path: string, body?: unknown, runId = 'run-1') {
  const { session } = await ok<InvokeResult>(page, name, 'invoke', { kind: 'session', actor }, { runId });
  return ok<InvokeResult>(page, name, 'invoke', { kind: 'request', session: session ?? null, request: { method, path, body } }, { runId });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test/runtime.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('同じ seed なら同じ初期データ、違う seed なら違う初期データになる', async ({ page }) => {
  const a = await ok<FixtureData>(page, 'verifier', 'prepare', options(1));
  const b = await ok<FixtureData>(page, 'verifier', 'prepare', options(1));
  const c = await ok<FixtureData>(page, 'verifier', 'prepare', options(2));
  expect(a).toEqual(b);
  expect(c.hash).not.toBe(a.hash);
  expect(c.refs['notes.alice.body']).not.toBe(a.refs['notes.alice.body']);
});

test('セッションは演習ハーネスだけが発行し、認可はフックの実装で決まる', async ({ page }) => {
  const { refs } = await ok<FixtureData>(page, 'verifier', 'prepare', options(3));
  const path = `/notes/${refs['notes.alice.id']}`;

  expect((await request(page, 'verifier', 'alice', 'GET', path)).response?.status).toBe(200);
  expect((await request(page, 'verifier', 'bob', 'GET', path)).response?.status).toBe(403);
  // リクエストの値に利用者を書いても認証済みの主体にはならない
  expect((await request(page, 'verifier', 'anonymous', 'POST', '/notes', { owner: 'alice', body: 'x' })).response?.status).toBe(401);
  expect((await call(page, 'verifier', 'invoke', { kind: 'request', session: 'forged-token', request: { method: 'GET', path: '/notes' } }, { runId: 'r' })))
    .toMatchObject({ ok: true, value: { response: { status: 401 } } });

  await ok(page, 'verifier', 'setImplementation', 'note.read', 'test-pack/any-owner');
  const leaked = await request(page, 'verifier', 'bob', 'GET', path);
  expect(leaked.response).toEqual({ status: 200, body: { note: { id: refs['notes.alice.id'], owner: 'alice', body: refs['notes.alice.body'] } } });
});

test('登録されていない実装・別フック用の実装・未登録のアプリは拒否する', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(4));
  expect(await call(page, 'verifier', 'setImplementation', 'note.read', 'test-pack/missing')).toMatchObject({ ok: false, code: 'unknown-implementation' });
  expect(await call(page, 'verifier', 'setImplementation', 'note.read', 'test-pack/html')).toMatchObject({ ok: false, code: 'unknown-implementation' });
  expect(await call(page, 'verifier', 'setImplementation', 'note.render', 'test-pack/any-owner')).toMatchObject({ ok: false, code: 'unknown-implementation' });
  expect(await call(page, 'verifier', 'prepare', { ...options(4), app: { id: 'other', version: '1.0.0' } })).toMatchObject({ ok: false, code: 'unknown-app' });
});

test('観測イベントを返し、教材アプリ内の例外は 500 の応答として返す', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(5));
  const list = await request(page, 'verifier', 'alice', 'GET', '/notes');
  expect(list.events).toContainEqual({ type: 'sql.query', data: expect.objectContaining({ owners: ['alice'] }) });

  const crash = await request(page, 'verifier', 'alice', 'GET', '/crash');
  expect(crash.response).toEqual({ status: 500, body: { error: 'boom' } });
  expect(crash.events).toContainEqual({ type: 'app.error', data: { message: 'boom' } });
});

test('タイムアウトで停止し、prepare し直すまで呼び出しを受け付けない', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(6));
  const started = Date.now();
  expect(await call(page, 'verifier', 'invoke', { kind: 'request', session: null, request: { method: 'GET', path: '/slow' } }, { runId: 'slow', timeoutMs: 500 }))
    .toMatchObject({ ok: false, code: 'timeout' });
  expect(Date.now() - started).toBeLessThan(2000);
  expect(await call(page, 'verifier', 'invoke', { kind: 'session', actor: 'alice' }, { runId: 'after' })).toMatchObject({ ok: false, code: 'not-prepared' });

  await ok(page, 'verifier', 'prepare', options(6));
  expect((await request(page, 'verifier', 'alice', 'GET', '/notes')).response?.status).toBe(200);
});

test('停止すると実行中の呼び出しは stopped で終わり、偽の成功を返さない', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(7));
  const outcome = await page.evaluate(async () => {
    const pending = window.runtimeTest.call('verifier', 'invoke', { kind: 'request', session: null, request: { method: 'GET', path: '/slow' } }, { runId: 'slow' });
    await new Promise((r) => setTimeout(r, 100));
    await window.runtimeTest.call('verifier', 'stop');
    return pending;
  });
  expect(outcome).toMatchObject({ ok: false, code: 'stopped' });
});

test('上限を超える入力は理由を付けて拒否する', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(8));
  const result = await call(page, 'verifier', 'invoke', { kind: 'request', session: null, request: { method: 'POST', path: '/notes', body: { body: 'x'.repeat(5000) } } }, { runId: 'big' });
  expect(result).toMatchObject({ ok: false, code: 'input-too-large' });
});

test('reset は実装の選択を保ったまま初期データへ戻す', async ({ page }) => {
  const initial = await ok<FixtureData>(page, 'verifier', 'prepare', options(9));
  await ok(page, 'verifier', 'setImplementation', 'note.read', 'test-pack/any-owner');
  await request(page, 'verifier', 'alice', 'POST', '/notes', { body: '追加したノート' });
  expect(((await request(page, 'verifier', 'alice', 'GET', '/notes')).response?.body as { notes: unknown[] }).notes).toHaveLength(2);

  expect(await ok<FixtureData>(page, 'verifier', 'reset')).toEqual(initial);
  expect(((await request(page, 'verifier', 'alice', 'GET', '/notes')).response?.body as { notes: unknown[] }).notes).toHaveLength(1);
  expect((await request(page, 'verifier', 'bob', 'GET', `/notes/${initial.refs['notes.alice.id']}`)).response?.status).toBe(200);
});

test('教材ロジックから通信・保存の API を使えない', async ({ page }) => {
  await ok(page, 'verifier', 'prepare', options(10));
  expect((await request(page, 'verifier', 'alice', 'GET', '/probe/storage')).response?.body).toEqual({ indexedDB: 'blocked', fetch: 'blocked' });
});

test.describe('プレビュー', () => {
  test('閲覧者を切り替えて画面を表示し、画面からの呼び出しをやり取りとして記録する', async ({ page }) => {
    const { refs } = await ok<FixtureData>(page, 'exercise', 'prepare', options(11));
    await ok(page, 'exercise', 'start');
    await ok(page, 'exercise', 'showView', 'alice', '/notes', 'view-1');

    const frame = page.frameLocator('#preview iframe');
    await expect(frame.getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
    await expect(frame.getByRole('listitem')).toHaveText([String(refs['notes.alice.body'])]);
    await expect(page.locator('#preview iframe')).toHaveAttribute('sandbox', 'allow-scripts');

    const exchanges = await page.evaluate(() => window.runtimeTest.exchanges());
    expect(exchanges).toContainEqual(
      expect.objectContaining({ runId: 'view-1', actor: 'alice', kind: 'request', request: { method: 'GET', path: '/notes' }, response: expect.objectContaining({ status: 200 }) }),
    );
    expect(exchanges).toContainEqual(expect.objectContaining({ runId: 'view-1', actor: 'alice', kind: 'render', route: '/notes' }));

    await ok(page, 'exercise', 'showView', 'bob', '/notes', 'view-2');
    await expect(frame.getByRole('heading', { name: 'ノート（bob）' })).toBeVisible();
    await expect(frame.getByRole('listitem')).toHaveText(['bob-note']);
    expect(await page.evaluate(() => window.runtimeTest.rejected('exercise'))).toBe(0);
  });

  test('view のフックを危険な HTML 解釈に切り替えると、検証済みペイロードが実 DOM で実行される', async ({ page }) => {
    await ok(page, 'verifier', 'prepare', options(12));
    await ok(page, 'verifier', 'start');
    await request(page, 'verifier', 'alice', 'POST', '/notes', { body: '<img src="x" onerror="pqMarker()">' });
    const { session } = await ok<InvokeResult>(page, 'verifier', 'invoke', { kind: 'session', actor: 'alice' }, { runId: 'r' });
    const render = (runId: string) => ok<InvokeResult>(page, 'verifier', 'invoke', { kind: 'render', session, view: { route: '/notes' } }, { runId });

    const safe = await render('render-text');
    expect(safe.events.map((e) => e.type)).not.toContain('dom.marker');
    expect(safe.events).toContainEqual(expect.objectContaining({ type: 'sql.query' }));

    await ok(page, 'verifier', 'setImplementation', 'note.render', 'test-pack/html');
    const unsafe = await render('render-html');
    expect(unsafe.events.map((e) => e.type)).toContain('dom.marker');
  });
});
