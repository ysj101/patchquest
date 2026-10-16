// ミッション3「検索条件からの情報漏えいを防ぐ」（SQL インジェクション、Issue #19）。
// 登録済みの検索語で他人のメモが返り（A10）、値としてバインドすると日本語・引用符・該当なしも守れる（A11）。
// UNION という語だけを止めても不合格、検索を止めると正常系が壊れる
import type { Page } from '@playwright/test';
import { answerTransferCheck, expect, expectCalloutMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith, openHome } from './fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'catalog-cause': '検索語を SQL の文字としてつないでいるため、検索語の中で条件を書き換えられる',
  'catalog-defense': '検索語を値としてバインドし、自分の貸出だけという条件を残す',
  'login-cause': '入力を SQL の文字列につないでいるため、入力の中で照合の条件を書き換えられる',
  'sort-column-defense': '受け付ける列名を決まった一覧から選び、一覧にない指定は断る',
};

const OR_TITLE = "') OR title LIKE '%' --";

async function search(page: Page, term: string): Promise<void> {
  const app = preview(page);
  await app.getByRole('button', { name: '検索', exact: true }).click();
  await app.getByLabel('検索語').fill(term);
  await app.getByRole('button', { name: '検索する' }).click();
}

/** 画面を開き直し、所有者の条件を広げる検索語で、3 人分の非公開メモが出ることを確かめる */
async function leakedPrivates(page: Page): Promise<void> {
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await search(page, OR_TITLE);
  await expect(preview(page).getByRole('button', { name: '非公開のメモ', exact: true })).toHaveCount(3);
}

test('登録済みの検索語で他人のメモが返り、値としてのバインドだけが合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await openHome(page);
  await expect(page.locator('[data-mission="sqli"]').getByRole('heading', { name: '検索条件からの情報漏えいを防ぐ' })).toBeVisible();
  await expect(page.locator('[data-mission="sqli"]')).toContainText('目安 15 分');
  await startMission(page, 'sqli');
  const app = preview(page);

  // A10：登録済みの検索語で所有者の条件を迂回し、別の利用者のメモが結果に含まれる
  await page.getByRole('tab', { name: '調査' }).click();
  await page.getByLabel('登録済みの検索語').selectOption({ label: '所有者の条件を広げる（タイトル）' });
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(seals(page)).toContainText('再現：達成');
  await leakedPrivates(page);

  // 特定の語だけを止めても、その語を使わない検索語では他人のメモが返る
  await verifyWith(page, 'UNION という語だけを止める');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 20_000 });
  await leakedPrivates(page);

  // 検索を止めると、自分のメモも探せない
  await verifyWith(page, '検索を止める');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('普段の使い方が壊れています', { timeout: 20_000 });
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await search(page, '週報');
  await expect(app.getByText('該当するメモはありません。')).toBeVisible();

  // A11：値としてバインドすると、他人のメモは返らず、日本語・引用符・該当なしは通る
  await verifyWith(page, '検索語を値としてバインドし、所有者の条件を残す');
  await expect(results(page)).toContainText('防御できました', { timeout: 20_000 });
  await expectCalloutMatchesVerdict(page);
  await expect(seals(page)).toContainText('防御：達成');
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await search(page, '週報');
  await expect(app.getByRole('button', { name: /^週報/ })).toHaveCount(1);
  await search(page, "O'Reilly");
  await expect(app.getByRole('button', { name: /本を読む/ })).toBeVisible();
  await search(page, '該当しない語句');
  await expect(app.getByText('該当するメモはありません。')).toBeVisible();
  await search(page, OR_TITLE);
  await expect(app.getByText('該当するメモはありません。')).toBeVisible();

  // 通常の演習は理解確認を全問出す
  expect(await answerTransferCheck(page, CORRECT_CHOICES)).toHaveLength(4);
});
