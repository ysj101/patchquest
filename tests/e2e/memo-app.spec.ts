// メモアプリの画面（プレビュー内）での利用者切替と CRUD（Issue #6）
import type { Page } from '@playwright/test';
import type { FixtureData } from '../../platform/contract';
import { expect, test } from './fixtures';

async function prepare(page: Page, seed: number): Promise<FixtureData> {
  const result = await page.evaluate(
    (s) =>
      window.runtimeTest.call('exercise', 'prepare', {
        attemptId: `memo-${s}`,
        app: { id: 'memo', version: '1.0.0' },
        fixture: { generator: 'memo.default', seed: s },
        implementations: {},
      }),
    seed,
  );
  if (!result.ok) throw new Error(result.message);
  await page.evaluate(() => window.runtimeTest.call('exercise', 'start'));
  return result.value as FixtureData;
}

const show = (page: Page, actor: string, route: string, runId: string) =>
  page.evaluate(([a, r, id]) => window.runtimeTest.call('exercise', 'showView', a, r, id), [actor, route, runId] as const);

test.beforeEach(async ({ page }) => {
  await page.goto('/test/runtime.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('利用者を切り替えると、その利用者のメモだけが表示される', async ({ page }) => {
  const { refs } = await prepare(page, 7);
  const app = page.frameLocator('#preview iframe');

  await show(page, 'alice', '/memos', 'alice-1');
  await expect(app.getByText(`${refs['users.alice.name']} さんとしてログイン中`)).toBeVisible();
  // 一般のメモ・非公開のメモ・週報・引用符を含むメモ
  await expect(app.getByRole('listitem')).toHaveCount(4);
  await app.getByRole('button', { name: '非公開のメモ' }).click();
  await expect(app.getByText(String(refs['memos.alice.private.body']))).toBeVisible();

  await show(page, 'bob', '/memos', 'bob-1');
  await expect(app.getByText(`${refs['users.bob.name']} さんとしてログイン中`)).toBeVisible();
  await expect(app.getByText(String(refs['memos.alice.private.body']))).toHaveCount(0);

  await show(page, 'anonymous', '/memos', 'anon-1');
  await expect(app.getByText('ログインしていません')).toBeVisible();
});

test('画面からメモを作成・編集・削除できる', async ({ page }) => {
  await prepare(page, 8);
  const app = page.frameLocator('#preview iframe');
  await show(page, 'carol', '/memos', 'carol-1');

  await app.getByRole('button', { name: '＋ 新しいメモ' }).click();
  await app.getByLabel('タイトル').fill('週末の予定');
  await app.getByLabel('本文').fill('図書館に行く <本を返す>');
  await app.getByRole('button', { name: '保存' }).click();
  await expect(app.getByRole('heading', { name: '週末の予定' })).toBeVisible();
  await expect(app.getByText('図書館に行く <本を返す>')).toBeVisible();

  await app.getByRole('button', { name: '編集' }).click();
  await app.getByLabel('本文').fill('図書館は休館日だった');
  await app.getByRole('button', { name: '保存' }).click();
  await expect(app.getByText('図書館は休館日だった')).toBeVisible();

  await app.getByRole('button', { name: '削除' }).click();
  await app.getByRole('button', { name: 'もう一度押すと削除します' }).click();
  await expect(app.getByRole('button', { name: '週末の予定' })).toHaveCount(0);

  // 画面の操作はリクエスト相当の呼び出しとして記録される
  const exchanges = await page.evaluate(() => window.runtimeTest.exchanges());
  const calls = exchanges.filter((x) => x.kind === 'request').map((x) => `${x.request?.method} ${x.response?.status}`);
  expect(calls).toEqual(expect.arrayContaining(['POST 201', 'PUT 200', 'DELETE 204']));
});

test('画面の入力欄は文字数を制限し、検証エラーは画面に表示される', async ({ page }) => {
  await prepare(page, 9);
  const app = page.frameLocator('#preview iframe');
  await show(page, 'alice', '/memos/new', 'alice-new');
  await expect(app.getByLabel('タイトル')).toHaveAttribute('maxlength', '40');
  await app.getByRole('button', { name: '保存' }).click();
  await expect(app.getByRole('alert')).toHaveText('タイトルを入力してください');
});

test('共有ページのコメントは文字として表示され、投稿するとほかの利用者にも見える', async ({ page }) => {
  const { refs } = await prepare(page, 10);
  const app = page.frameLocator('#preview iframe');
  await show(page, 'alice', '/memos', 'alice-pages');
  await app.getByRole('button', { name: '共有ページ' }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await expect(app.getByText(String(refs['comments.bob.body']))).toBeVisible();

  await app.getByLabel('コメントを書く').fill('<b>太字にならない</b> & "引用"');
  await app.getByRole('button', { name: 'コメントする' }).click();
  await expect(app.getByText('<b>太字にならない</b> & "引用"')).toBeVisible();
  await expect(app.locator('.comment-body b')).toHaveCount(0);

  await show(page, 'carol', `/pages/${refs['pages.shared.id']}`, 'carol-page');
  await expect(app.getByText('<b>太字にならない</b> & "引用"')).toBeVisible();
});

test('自分のメモだけを検索でき、該当がなければその旨を表示する', async ({ page }) => {
  await prepare(page, 11);
  const app = page.frameLocator('#preview iframe');
  await show(page, 'bob', '/search', 'bob-search');
  await app.getByLabel('検索語').fill('週報');
  await app.getByRole('button', { name: '検索する' }).click();
  await expect(app.getByRole('button', { name: /^週報/ })).toHaveCount(1);

  await app.getByLabel('検索語').fill("O'Reilly");
  await app.getByLabel('検索語').press('Enter');
  await expect(app.getByText('該当するメモはありません。')).toBeVisible();

  // 画面の検索は実際の SQL の観測イベントを伴う
  const exchanges = await page.evaluate(() => window.runtimeTest.exchanges());
  expect(exchanges.some((x) => x.request?.path.startsWith('/api/search') && x.events.some((e) => e.type === 'sql.query'))).toBe(true);
});
