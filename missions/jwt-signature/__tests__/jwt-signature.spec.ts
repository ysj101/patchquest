// 課題「書き換えたトークンを断る」（Issue #237）。教材アプリの「ログイントークン」の画面でトークンを分けて読み、
// 中身の名前を書き換えて送ると他人のメモが返って再現になる。署名が付いているかを見るだけでは不合格、
// すべて断ると正常系が壊れ、鍵で署名を計算し直して比べると合格する。通信・保存の API を塞いだ Worker の中で、WebCrypto の署名と検証が動くことも兼ねて確かめる
import type { Page } from '@playwright/test';
import { answerTransferCheck, expect, expectDefended, expectSealMatchesVerdict, openHome, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'booking-cause': '受け取る処理が、署名を鍵で計算し直して比べずに、中身をそのまま信じている',
  'reset-link-defense': 'リンクを受け取ったら、鍵で署名を計算し直し、付いてきた署名と合うときだけ先へ進める',
};

const result = (page: Page) => preview(page).getByRole('region', { name: 'トークンで取り出した結果' });
const outgoing = (page: Page, part: 'header' | 'payload' | 'signature') => preview(page).locator(`h3:text-is("送るトークン") + div .token-${part}`);

/** 「ログイントークン」の画面を開いて、いまの利用者のトークンを発行する */
async function issueToken(page: Page): Promise<void> {
  const app = preview(page);
  await app.getByRole('button', { name: 'ログイントークン' }).click();
  await app.getByRole('button', { name: 'トークンを発行する' }).click();
  // 負荷の高い環境では、発行（署名の計算を待つ応答）と描画が、expect の既定の 5 秒を超えることがある
  await expect(app.getByRole('heading', { name: '送るトークン' })).toBeVisible({ timeout: 15_000 });
}

/** 中身の元の文字を書き換えて、そのトークンを送る */
async function sendAs(page: Page, name: string): Promise<void> {
  const app = preview(page);
  await app.getByLabel('元の文字（書き換えられます）').fill(JSON.stringify({ sub: name }));
  await app.getByRole('button', { name: 'このトークンでメモを取り出す' }).click();
}

test('トークンの中身を書き換えて他人のメモを取り出し、署名を計算し直して比べる対策だけが合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await openHome(page);
  await expect(page.locator('[data-mission="jwt-signature"]').getByRole('heading', { name: '書き換えたトークンを断る' })).toBeVisible();
  await startMission(page, 'jwt-signature');
  const app = preview(page);
  await page.getByRole('radio', { name: /^bob/ }).check();
  await expect(app.getByText('bob さんとしてログイン中')).toBeVisible();

  // 発行されたトークンは 3 つの部分に分かれ、前の 2 つは元の文字に戻せる
  await issueToken(page);
  await expect(app.getByText('{"alg":"HS256","typ":"JWT"}')).toBeVisible();
  await expect(app.getByLabel('元の文字（書き換えられます）')).toHaveValue('{"sub":"bob"}');
  const issued = { payload: await outgoing(page, 'payload').innerText(), signature: await outgoing(page, 'signature').innerText() };
  expect(issued.signature).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // 発行されたままのトークンでは自分のメモが返り、再現にはならない
  await app.getByRole('button', { name: 'このトークンでメモを取り出す' }).click();
  await expect(result(page).getByRole('heading', { name: /^bob さんのメモ/ })).toBeVisible();
  await expect(seals(page)).toContainText('再現：未達成');

  // 中身を書き換えると 2 つ目の部分だけが変わり、署名は変わらない。送ると alice のメモが返る
  await sendAs(page, 'alice');
  await expect(app.getByRole('status')).toHaveText('中身を書き換えました。署名は、発行されたときのままです。');
  expect(await outgoing(page, 'payload').innerText()).not.toBe(issued.payload);
  expect(await outgoing(page, 'signature').innerText()).toBe(issued.signature);
  await expect(result(page).getByRole('heading', { name: /^alice さんのメモ/ })).toBeVisible();
  await expect(result(page)).toContainText('（alice）');
  await expect(seals(page)).toContainText('再現：達成');
  await page.locator('[data-anchor="investigation-log"]').getByText('POST /api/token/memos').first().click();
  await expect(page.locator('[data-anchor="investigation-log"]')).toContainText('トークン：受け付けた（中身を読んだだけ）・トークンに書かれた利用者 alice・署名 鍵で計算した値と合わない');

  // 署名が付いているかを見るだけでは、書き換えたトークンが通る
  await verifyWith(page, '署名が付いているトークンだけを受け付ける');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 20_000 });
  await expect(results(page)).toContainText('署名が付いていれば、中身を書き換えたトークンでもそのまま通り、他人のメモが取り出せました。');

  // すべて断ると、本人も自分のメモを取り出せない
  await verifyWith(page, 'トークンでの取り出しを、すべて断る');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています', { timeout: 20_000 });

  // 鍵で署名を計算し直して比べると合格。書き換えたトークンは断られ、発行されたままのトークンは使える
  await verifyWith(page, '鍵で署名を計算し直し、合ったトークンだけを受け付ける');
  await expectSealMatchesVerdict(page);
  await expectDefended(page);
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await issueToken(page);
  await sendAs(page, 'alice');
  await expect(result(page)).toHaveText('トークンを受け付けられません（署名が合わない）');
  await sendAs(page, 'bob');
  await expect(app.getByRole('status')).toHaveText('発行されたトークンのままです。');
  await expect(result(page).getByRole('heading', { name: /^bob さんのメモ/ })).toBeVisible();

  expect(await answerTransferCheck(page, CORRECT_CHOICES)).toHaveLength(2);
});

test('ログインしていないと、ログイントークンの画面は開かない', async ({ page }) => {
  await startMission(page, 'jwt-signature');
  await page.getByRole('radio', { name: /未ログイン/ }).check();
  await expect(preview(page).getByText('ログインしていません。')).toBeVisible();
  await expect(preview(page).getByRole('button', { name: 'ログイントークン' })).toHaveCount(0);
});
