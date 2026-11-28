// ミッション「XML の取り込みで、サーバのファイルが混ざるのを防ぐ」（XXE、Issue #239）。
// 通信の API を塞いだ Worker の中の libxml2 で、外部実体が指すサーバのファイル（架空）の中身がメモに入り、
// 外部実体の読み込みを禁じるオプションを足したときだけ合格する。ネットワークだけを禁じても不合格、取り込みを止めると正常系が壊れる
import type { Page } from '@playwright/test';
import { answerTransferCheck, expect, expectSealMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'invoice-cause': 'パーサーが、XML の中に書かれた場所の資源まで読みに行く設定で呼び出されている',
  'invoice-defense': 'パーサーの呼び出しに、外部実体の読み込みを禁じるオプション（XML_PARSE_NO_XXE）を足す',
};

const importEntries = (page: Page) => page.locator('.log > li').filter({ hasText: 'POST /api/import' });

/** send で取り込みを 1 回送り、観測ログに増えた取り込みの記録（いちばん新しいもの）を開いて返す */
async function importedBy(page: Page, send: () => Promise<void>) {
  const before = await importEntries(page).count();
  await send();
  await expect(importEntries(page)).toHaveCount(before + 1);
  const entry = importEntries(page).first();
  await entry.locator('summary').click();
  return entry;
}

/** 調査の操作で、サーバのファイルを指す XML を取り込む */
function importPointingAt(page: Page, path: string) {
  return importedBy(page, async () => {
    await page.getByRole('tab', { name: '調査' }).click();
    await page.getByLabel('読ませるファイルの場所', { exact: true }).fill(path);
    await page.locator('form.action').filter({ hasText: 'サーバのファイルを指す XML を取り込む' }).getByRole('button', { name: '送る', exact: true }).click();
  });
}

test('外部実体でサーバのファイルがメモに入り、外部実体の読み込みを禁じるオプションだけが合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await startMission(page, 'xxe');
  const app = preview(page);

  // 教材アプリの画面から、見本の XML を取り込める
  await app.getByRole('button', { name: '取り込み', exact: true }).click();
  await app.getByRole('button', { name: '見本を入れる' }).click();
  await app.getByRole('button', { name: '取り込む', exact: true }).click();
  await expect(app.getByRole('status')).toHaveText('1 件のメモを取り込みました。');
  await expect(app.getByText('段ボールを 10 箱もらう')).toBeVisible();

  // 文書の中で決めた実体は、決めた文字に置き換わる。観測ログは、取り込んだ XML を書いたとおりに出す
  const entity = await importedBy(page, async () => {
    await page.getByLabel('登録済みの XML', { exact: true }).selectOption({ label: '実体を使う XML' });
    await page.locator('form.action').filter({ hasText: '登録済みの XML を取り込む' }).getByRole('button', { name: '送る', exact: true }).click();
  });
  await expect(entity).toContainText('<!ENTITY sign "田中より">');
  await expect(entity).toContainText('先日はありがとうございました。田中より');
  await expect(entity).toContainText('求められた資源：なし');

  // サーバの名前を指すと、その中身が本文になる。まだ再現ではない
  const hostname = await importPointingAt(page, '/etc/hostname');
  await expect(hostname).toContainText(/"body": "memo-app-\d\d"/);
  await expect(hostname).toContainText(/XML の解析：オプション XML_PARSE_NOENT\n求められた資源：file:\/\/\/etc\/hostname（渡した 12 バイト）/);
  await expect(seals(page)).toContainText('再現：未達成');

  // 指す先を設定ファイルに変えると、パスワードが本文に入る（再現）
  const env = await importPointingAt(page, '/srv/memo/.env');
  await expect(env).toContainText(/MAIL_PASSWORD=pq-[0-9a-f]{6}/);
  await expect(env).toContainText('求められた資源：file:///srv/memo/.env（渡した 43 バイト）');
  await expect(seals(page)).toContainText('再現：達成');

  // ネットワークからの読み込みを禁じても、サーバのファイルは読まれる
  await verifyWith(page, 'ネットワークからの読み込みを禁じるオプション（XML_PARSE_NONET）を足す');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 20_000 });
  await expect(results(page)).toContainText('サーバの中のファイルは、ネットワークを通らずに開けるので、そのまま読まれてメモに入りました。');

  // 取り込みを止めると、ふつうの XML も取り込めない
  await verifyWith(page, '取り込みを止める');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています', { timeout: 20_000 });

  // 外部実体の読み込みを禁じると合格する。同じ XML を送っても、資源は求められない
  await verifyWith(page, '外部実体の読み込みを禁じるオプション（XML_PARSE_NO_XXE）を足す');
  await expect(results(page)).toContainText('防御できました', { timeout: 20_000 });
  await expectSealMatchesVerdict(page);
  await expect(seals(page)).toContainText('防御：達成');
  const fixed = await importPointingAt(page, '/srv/memo/.env');
  await expect(fixed).toContainText('XML の解析：オプション XML_PARSE_NOENT | XML_PARSE_NO_XXE');
  await expect(fixed).toContainText('求められた資源：なし');
  await expect(fixed).not.toContainText('MAIL_PASSWORD');

  expect(await answerTransferCheck(page, CORRECT_CHOICES)).toHaveLength(2);
});
