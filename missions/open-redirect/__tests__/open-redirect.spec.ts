// ミッション「サインインのあとの行き先を守る」（オープンリダイレクト、Issue #232）。教材アプリの画面とアドレス欄だけで、
// 外のサイトへの移動を再現し、文字の並びだけを見る対策は不合格、URL として読む対策だけが合格することを確かめる
import type { Page } from '@playwright/test';
import { answerTransferCheck, expect, expectSealMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** 理解確認の正解の選択肢（設問 ID → ラベル） */
const CORRECT_CHOICES: Record<string, string> = {
  'logout-cause': 'サーバが、return の値を確かめずに、移動先（Location）にしている',
  'payment-defense': 'back の値を URL として読み、自分のサイトの中のときだけ移動する。それ以外は、決まったページへ送る',
};

const FAKE_SITE = 'https://evil.example/login';
const address = (page: Page) => page.getByRole('textbox', { name: 'アドレス' });
const external = (page: Page) => page.locator('.preview-slot .http-external');

/** アドレス欄にパスを入れて開く */
async function openAddress(page: Page, path: string): Promise<void> {
  await address(page).fill(path);
  await page.getByRole('button', { name: '開く', exact: true }).click();
}

/** 最初の画面を開き直してサインアウトし、next を付けたサインインの画面を開いてサインインする */
async function signInWithNext(page: Page, next: string): Promise<void> {
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  const signOut = preview(page).getByRole('button', { name: 'サインアウト' });
  await expect(preview(page).getByRole('heading', { name: 'お知らせ' })).toBeVisible();
  if (await signOut.isVisible()) await signOut.click();
  await expect(preview(page).getByRole('link', { name: 'サインイン', exact: true })).toBeVisible();
  await openAddress(page, `/login?next=${next}`);
  await preview(page).getByRole('button', { name: 'bob としてサインインする' }).click();
}

test('next の値で外のサイトへ移動させられ、URL として読む対策だけが合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await startMission(page, 'open-redirect');
  const app = preview(page);

  // ふだんの使い方：サインインせずにお知らせを開くと、もとのページを next に入れてサインインの画面へ移動し、サインインすると戻る
  const notice = app.getByRole('listitem').getByRole('link').first();
  const title = await notice.innerText();
  await notice.click();
  await expect(app.getByRole('heading', { name: 'サインイン' })).toBeVisible();
  await expect(address(page)).toHaveValue(/^\/login\?next=%2Fnotices%2F\d+$/);
  await app.getByRole('button', { name: 'bob としてサインインする' }).click();
  await expect(app.getByRole('heading', { name: title })).toBeVisible();
  await expect(address(page)).toHaveValue(/^\/notices\/\d+$/);
  // 観測ログには、応答のステータスとヘッダが出る。自分のサイトの中の移動では、再現の印は付かない
  const signIn = page.locator('.log-entry').filter({ hasText: 'bob → POST /login' }).first();
  await signIn.locator('summary').click();
  await expect(signIn).toContainText('応答（ステータス 302）のヘッダ');
  await expect(signIn).toContainText(/Location: \/notices\/\d+/);
  await expect(signIn).toContainText('リダイレクト：行き先');
  await expect(seals(page)).toContainText('再現：未達成');

  // 再現：next を外のサイトのアドレスにしてサインインすると、応答が外のサイトへ移動させる。移動は教材が止めて知らせる
  await signInWithNext(page, FAKE_SITE);
  await expect(external(page)).toContainText('教材アプリの外へ移動するところでした');
  await expect(external(page).locator('.http-external-url')).toHaveText(FAKE_SITE);
  await expect(address(page)).toHaveValue(FAKE_SITE);
  await expect(seals(page)).toContainText('再現：達成');
  await external(page).getByRole('button', { name: '教材アプリへ戻る' }).click();
  await expect(external(page)).toBeHidden();
  await expect(app.getByRole('heading', { name: 'サインイン' })).toBeVisible();

  // 1 文字目だけを見る対策は、// で始まる値を通す
  await verifyWith(page, '行き先の 1 文字目が / のときだけ従う');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。');
  await expect(results(page)).toContainText('// や /\\ で始まる行き先は、1 文字目が / なのでそのまま通りました。');
  await signInWithNext(page, '//evil.example/login');
  await expect(external(page).locator('.http-external-url')).toHaveText('http://evil.example/login');

  // いつもトップへ送ると、開こうとしていたお知らせへ戻れない
  await verifyWith(page, 'サインインのあとは、いつもトップへ送る');
  await expectSealMatchesVerdict(page);
  await expect(results(page)).toContainText('ふだんの使い方が壊れています');

  // URL として読む対策は合格し、同じリンクを開いても、サインインのあとはポータルのトップへ移動する
  await verifyWith(page, '行き先を URL として読み、このサイトの中のときだけ従う');
  await expect(results(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');
  for (const next of [FAKE_SITE, '//evil.example/login']) {
    await signInWithNext(page, next);
    await expect(app.getByRole('heading', { name: 'お知らせ' })).toBeVisible();
    await expect(external(page)).toBeHidden();
    await expect(address(page)).toHaveValue('/');
  }

  await answerTransferCheck(page, CORRECT_CHOICES);
});

test('アドレス欄は教材アプリの中のパスだけを開き、キーボードでも開ける', async ({ page }) => {
  await startMission(page, 'open-redirect');
  const app = preview(page);

  // 外のアドレスや、パスでない値は開かずに、入れ方を知らせる
  await openAddress(page, FAKE_SITE);
  await expect(page.locator('.preview-slot .form-message')).toHaveText('アドレスは、/ で始まる教材アプリの中のパスで入れてください（例：/login）。');
  await expect(app.getByRole('heading', { name: 'お知らせ' })).toBeVisible();

  // Enter でも開ける。.. で置き場所の外へは出ない（教材アプリの 404 が出る）
  await address(page).fill('/login');
  await address(page).press('Enter');
  await expect(app.getByRole('heading', { name: 'サインイン' })).toBeVisible();
  await expect(page.locator('.preview-slot .form-message')).toBeHidden();
  await openAddress(page, '/../../index.html');
  await expect(app.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
  await expect(address(page)).toHaveValue('/index.html');

  // 利用者を切り替えると、その人として最初の画面が開く
  await page.getByRole('radio', { name: 'alice' }).check();
  await expect(page.getByText('alice として表示しています')).toBeAttached();
  await openAddress(page, '/login');
  await expect(app.getByRole('button', { name: 'alice としてサインインする' })).toBeVisible();
  await page.getByRole('radio', { name: '未ログイン' }).check();
  await expect(page.getByText('未ログイン として表示しています')).toBeAttached();
  await openAddress(page, '/login');
  await expect(app.getByText('「表示する利用者」で、利用者を選んでください。')).toBeVisible();
});
