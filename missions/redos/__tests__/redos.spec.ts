// 課題「終わらない入力チェックを直す」（ReDoS、Issue #238）。同じ文字を並べて最後だけ使えない文字にした表示名で、
// 正規表現エンジン PCRE2（WASM）の照合が処理の上限に達して打ち切られる。正規表現を書き直す対策だけが合格し、
// 縮める・打ち切りを通す・変更を止める、は合格しない。合否は経過時間ではなく、エンジンが上限に達したかどうかで決まる
import type { Locator, Page } from '@playwright/test';
import { answerTransferCheck, expect, expectSealMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith, openHome } from '../../../tests/e2e/fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'order-cause': 'くり返しの中にくり返しがあり、数字の並びを何通りにも分けられるので、一致しないと決めるまでの回数が跳ね上がる',
  'order-defense': '正規表現を ^[0-9]+(-[0-9]+)*$ に書き直し、ハイフンを「数字のかたまりの間に必ず 1 つ」にする',
};

const ATTACK = `${'a'.repeat(19)}!`;
const ABORTED = '表示名のチェックが終わらなかったため、途中で打ち切りました';
const RULE = '表示名に使えるのは、半角の英小文字と数字です。';

/** 教材アプリの「表示名」の画面を開き直して、表示名を送る */
async function changeName(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  const app = preview(page);
  await app.getByRole('button', { name: '表示名', exact: true }).click();
  await app.getByLabel('新しい表示名').fill(name);
  await app.getByRole('button', { name: '変更する' }).click();
}

/** 調査タブの定型の操作で、登録済みの表示名を送り、観測ログのその行（表示名を変える呼び出し）を開いて返す */
async function sendRegistered(page: Page, label: string, status: number): Promise<Locator> {
  const sent = page.locator('[data-anchor="investigation-log"] details').filter({ hasText: 'PUT /api/me' });
  const before = await sent.count();
  await page.getByLabel('登録済みの表示名', { exact: true }).selectOption({ label });
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(sent).toHaveCount(before + 1);
  // 新しい記録が先頭に並ぶ
  const entry = sent.first();
  await expect(entry.locator('summary')).toContainText(String(status));
  await entry.locator('summary').click();
  return entry;
}

test('入れ子のくり返しで照合が打ち切られ、正規表現の書き直しだけが合格する', async ({ page }) => {
  test.setTimeout(180_000);
  await openHome(page);
  await expect(page.locator('[data-mission="redos"]').getByRole('heading', { name: '終わらない入力チェックを直す' })).toBeVisible();
  await startMission(page, 'redos');
  const app = preview(page);

  // 入力が 4 文字増えるごとに、試した回数が 16 倍になる。断られるだけでは再現にならない
  await page.getByRole('tab', { name: '調査' }).click();
  await expect(await sendRegistered(page, 'a が 4 個と !（5 文字）', 400)).toContainText('結果：一致しない\nパターンの項目を試した回数：72 回');
  await expect(await sendRegistered(page, 'a が 8 個と !（9 文字）', 400)).toContainText('パターンの項目を試した回数：1,152 回');
  await expect(seals(page)).not.toContainText('再現：達成');

  // 19 個にすると、エンジンが処理の上限に達して照合を打ち切る
  await expect(await sendRegistered(page, 'a が 19 個と !（20 文字）', 503)).toContainText('結論が出ないまま打ち切り（エンジンの処理の上限 match limit 1,000,000 に達した）');
  await expect(seals(page)).toContainText('再現：達成');
  await changeName(page, ATTACK);
  await expect(app.getByRole('alert')).toHaveText(ABORTED);

  // 長さを縮めると、決まりに合う長い表示名が使えなくなる
  await verifyWith(page, '表示名を 10 文字までに縮める');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています', { timeout: 30_000 });
  await changeName(page, 'taro.yamada');
  await expect(app.getByRole('alert')).toHaveText('表示名は 10 文字以内にしてください');

  // 打ち切られたら通す直し方では、使えない文字の表示名が保存される
  await verifyWith(page, '打ち切られたら、チェックを通ったことにする');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 30_000 });
  await changeName(page, ATTACK);
  await expect(app.getByText(`${ATTACK} さんとしてログイン中`)).toBeVisible();

  // 変更を止めると、決まりに合う表示名にも変えられない
  await verifyWith(page, '表示名の変更を止める');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています', { timeout: 30_000 });

  // 正規表現を書き直すと、同じ表示名でも照合が最後まで終わって断り、決まりに合う表示名には変えられる
  await verifyWith(page, '記号を、かたまりとかたまりの間に必ず 1 つと書き直し、分け方を 1 通りにする');
  await expect(results(page)).toContainText('防御できました', { timeout: 30_000 });
  await expectSealMatchesVerdict(page);
  await expect(seals(page)).toContainText('防御：達成');
  await changeName(page, ATTACK);
  await expect(app.getByRole('alert')).toContainText(RULE);
  await changeName(page, 'yamada.hanako-tokyo2');
  await expect(app.getByText('yamada.hanako-tokyo2 さんとしてログイン中')).toBeVisible();
  await expect(app.getByRole('status')).toHaveText('表示名を変えました。');

  expect(await answerTransferCheck(page, CORRECT_CHOICES)).toHaveLength(2);
});
