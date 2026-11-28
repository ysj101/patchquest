// ミッション「スタンプが勝手に付くのを防ぐ」（送信元を確かめない postMessage、Issue #235）。
// 教材アプリの画面が埋め込んだ 2 つのページ（スタンプの部品・広告）が、本物の postMessage で画面へメッセージを送る。
// 広告のメッセージでスタンプが書き込まれることを再現し、オリジンが "null" かの確かめでは不合格、すべて捨てると正常系が壊れ、
// 送り主の窓の確かめで合格する。埋め込んだページは、画面・学習UI・となりの枠に届かない（docs/poc/postmessage-origin.md）
import type { FrameLocator, Page } from '@playwright/test';
import { answerTransferCheck, expect, expectSealMatchesVerdict, openHome, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'payment-cause': '届いたメッセージを、だれが送ったか確かめずに使っている',
  'login-defense': 'event.origin が、ログインのサイトのオリジンとぴったり同じかを確かめ、event.source が自分で開いた小窓かも確かめる',
};

const picker = (app: FrameLocator) => app.frameLocator('iframe[title="スタンプの部品"]');
const ad = (app: FrameLocator) => app.frameLocator('iframe[title="広告"]');
const written = (app: FrameLocator) => app.getByRole('list', { name: 'この画面で書き込んだスタンプ' }).getByRole('listitem');
const log = (page: Page) => page.locator('.log-entry');

/** 教材アプリの「共有ページ」から「スタンプを送る」画面を開く */
async function openStampScreen(app: FrameLocator): Promise<void> {
  await app.getByRole('button', { name: '共有ページ', exact: true }).click();
  await app.getByRole('button', { name: '共有ページ：今週の学習メモ' }).click();
  await app.getByRole('button', { name: 'スタンプを送る' }).click();
  await expect(picker(app).getByRole('button', { name: 'いいね！' })).toBeVisible();
  await expect(ad(app).getByRole('button', { name: '応募する' })).toBeVisible();
}

/** 対策を選んで検証したあと、教材アプリを開き直して「スタンプを送る」画面へ戻る */
async function reopenStampScreen(page: Page): Promise<FrameLocator> {
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  const app = preview(page);
  await openStampScreen(app);
  return app;
}

test('広告のページが送ったメッセージでスタンプが書き込まれ、送り主の窓の確かめだけが合格する', async ({ page }) => {
  test.setTimeout(180_000);
  await openHome(page);
  await expect(page.locator('[data-mission="postmessage-origin"]').getByRole('heading', { name: 'スタンプが勝手に付くのを防ぐ' })).toBeVisible();
  await startMission(page, 'postmessage-origin');
  let app = preview(page);
  await page.getByRole('radio', { name: /^carol/ }).check();
  await expect(app.getByText('carol さんとしてログイン中')).toBeVisible();
  await openStampScreen(app);

  // スタンプの部品のメッセージは受け入れられる。これだけでは再現にならない
  await picker(app).getByRole('button', { name: 'ありがとう！' }).click();
  await expect(written(app)).toHaveText(['carol さんの名前で「ありがとう！」を書き込みました']);
  await expect(seals(page)).toContainText('再現：未達成');

  // 広告のページが同じ形のメッセージを送ると、carol の名前で書き込まれる
  await ad(app).getByRole('button', { name: '応募する' }).click();
  await expect(written(app)).toHaveText(['carol さんの名前で「ありがとう！」を書き込みました', 'carol さんの名前で「いいね！」を書き込みました']);
  await expect(seals(page)).toContainText('再現：達成');

  // 観測ログに、届いたメッセージ・送り主の窓・送り主のオリジン・結果が出る。オリジンはどちらも "null"
  const fromAd = log(page).filter({ hasText: '届いたメッセージ：{"type":"stamp","stamp":"いいね！"}' }).first();
  await fromAd.locator('summary').click();
  await expect(fromAd).toContainText('送り主の窓（event.source）：広告の枠');
  await expect(fromAd).toContainText('送り主のオリジン（event.origin）："null"');
  await expect(fromAd).toContainText('結果：受け入れた（スタンプを書き込んだ）');
  const fromPicker = log(page).filter({ hasText: '届いたメッセージ：{"type":"stamp","stamp":"ありがとう！"}' }).first();
  await fromPicker.locator('summary').click();
  await expect(fromPicker).toContainText('送り主の窓（event.source）：スタンプの部品');
  await expect(fromPicker).toContainText('送り主のオリジン（event.origin）："null"');

  // 書き込まれたスタンプは、共有ページのコメントとして残る
  await app.getByRole('button', { name: '← 共有ページへ戻る' }).click();
  await expect(app.locator('.comment').filter({ hasText: 'いいね！' })).toContainText('carol');

  // オリジンが "null" かを確かめても、広告のオリジンも "null" なので防げない
  await verifyWith(page, '送り主のオリジンが "null" かを確かめる');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 30_000 });
  await expect(results(page)).toContainText('広告のオリジンも "null" で、広告のメッセージがそのまま通りました。');
  app = await reopenStampScreen(page);
  await ad(app).getByRole('button', { name: '応募する' }).click();
  await expect(written(app)).toHaveText(['carol さんの名前で「いいね！」を書き込みました']);

  // すべて捨てると、スタンプの部品も使えない
  await verifyWith(page, 'メッセージをすべて捨てる');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています', { timeout: 30_000 });
  app = await reopenStampScreen(page);
  await picker(app).getByRole('button', { name: 'おつかれさま！' }).click();
  await expect(log(page).filter({ hasText: '届いたメッセージ：{"type":"stamp","stamp":"おつかれさま！"}' })).toHaveCount(1);
  await expect(written(app)).toHaveCount(0);

  // 送り主の窓を確かめると、広告のメッセージは捨てられ、スタンプの部品は今までどおり使える
  await verifyWith(page, '送り主の窓が、スタンプの部品かを確かめる');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('防御できました', { timeout: 30_000 });
  await expect(seals(page)).toContainText('防御：達成');
  app = await reopenStampScreen(page);
  const before = await log(page).filter({ hasText: '届いたメッセージ：{"type":"stamp","stamp":"いいね！"}' }).count();
  await ad(app).getByRole('button', { name: '応募する' }).click();
  const dropped = log(page).filter({ hasText: '届いたメッセージ：{"type":"stamp","stamp":"いいね！"}' });
  await expect(dropped).toHaveCount(before + 1);
  await dropped.first().locator('summary').click();
  await expect(dropped.first()).toContainText('送り主の窓（event.source）：広告の枠');
  await expect(dropped.first()).toContainText('結果：捨てた');
  await expect(written(app)).toHaveCount(0);
  await picker(app).getByRole('button', { name: 'ありがとう！' }).click();
  await expect(written(app)).toHaveText(['carol さんの名前で「ありがとう！」を書き込みました']);

  expect(await answerTransferCheck(page, CORRECT_CHOICES)).toHaveLength(2);
});

test('教材アプリの画面が埋め込んだページは、画面・学習UI・となりの枠に届かず、学習UIとの通信路にも割り込めない', async ({ page }) => {
  await startMission(page, 'postmessage-origin');
  const app = preview(page);
  await openStampScreen(app);
  const hostUrl = page.url();
  // 学習者に見えている教材アプリの枠の、子の枠（検証用の見えない教材アプリにも、最後に検証した画面の枠が残っている）
  const appFrame = await (await page.locator('.preview-slot iframe').elementHandle()).contentFrame();
  if (!appFrame) throw new Error('教材アプリの枠がありません');
  const frames = appFrame.childFrames();
  expect(frames.map((frame) => decodeURIComponent(new URL(frame.url()).hash)).sort()).toEqual(['#memo/ad/', '#memo/stamp-picker/']);
  await expect(app.locator('iframe[title="広告"]')).toHaveAttribute('sandbox', 'allow-scripts');

  for (const frame of frames) {
    const outcomes = await frame.evaluate(() => {
      // 埋め込んだページの中で動くスクリプトが試しそうな操作
      const probes: Record<string, () => unknown> = {
        'parent-dom': () => parent.document.title,
        'top-dom': () => (top ?? window).document.title,
        'sibling-dom': () => [...Array(parent.frames.length).keys()].map((i) => parent.frames[i]).find((frame) => frame !== window)?.document.title,
        'own-storage': () => localStorage.length,
        cookie: () => document.cookie,
        origin: () => self.origin,
        'parent-navigation': () => parent.location.assign('/'),
        'top-navigation': () => (top ?? window).location.assign('/'),
      };
      const results: Record<string, string> = {};
      for (const [name, probe] of Object.entries(probes)) {
        try {
          results[name] = String(probe());
        } catch (error) {
          results[name] = error instanceof Error ? error.name : String(error);
        }
      }
      return results;
    });
    expect(outcomes).toEqual({
      'parent-dom': 'SecurityError',
      'top-dom': 'SecurityError',
      'sibling-dom': 'SecurityError',
      'own-storage': 'SecurityError',
      cookie: 'SecurityError',
      origin: 'null',
      'parent-navigation': 'SecurityError',
      'top-navigation': 'SecurityError',
    });
  }

  // 埋め込んだページが、学習UI からの指示（別の画面を描く）と同じ形のメッセージを画面へ送っても、画面は変わらない。
  // 学習UI へ、プレビューからの通知（実行マーカー）と同じ形のメッセージを送っても、観測ログに出ない
  const entries = await log(page).count();
  const [embedded] = frames;
  if (!embedded) throw new Error('埋め込んだページの枠がありません');
  await embedded.evaluate(() => {
    // 画面は sandbox の中にあり、オリジンを名指しできない。学習UI は、この文書と同じ配信元
    parent.postMessage({ type: 'render', runId: 'guess', appId: 'memo', route: '/memos', viewer: 'alice', implementations: {}, dataGeneration: 0 }, { targetOrigin: '*' });
    (top ?? window).postMessage({ type: 'event', runId: 'guess', event: { type: 'dom.marker', data: {} } }, location.origin);
    (top ?? window).postMessage({ type: 'rendered', runId: 'guess', route: '/memos' }, location.origin);
  });
  // 形の合わないメッセージとして、画面の受け取りの記録が 1 件増える（捨てた）。画面は「スタンプを送る」のまま
  await expect(log(page)).toHaveCount(entries + 1);
  await expect(log(page).first()).toContainText('届いたメッセージ：{"type":"render"');
  await expect(app.getByRole('heading', { name: /^スタンプを送る：/ })).toBeVisible();
  await expect(log(page).filter({ hasText: '実行マーカー' })).toHaveCount(0);
  expect(page.url()).toBe(hostUrl);
});
