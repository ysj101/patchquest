// オンボーディング（練習用パック）。一覧の「まずは練習」から、操作ガイドに沿って
// こわす → なおす → たしかめる → ふりかえる を最後まで進められる
import type { Page } from '@playwright/test';
import { backToList, expect, preview, startMission, test, ticketSeals as seals, verifyWith, openHome } from './fixtures';

const guide = (page: Page) => page.getByRole('complementary', { name: '操作ガイド' });
const target = (page: Page) => page.locator('[data-guide-target]');

/** ガイドが指定のステップを示している */
async function expectStep(page: Page, count: string, title: string): Promise<void> {
  await expect(guide(page).locator('.guide-count')).toHaveText(count);
  await expect(guide(page).getByRole('heading', { level: 3 })).toHaveText(title);
}

test('「まずは練習」から、操作ガイドに沿って最後まで進められる', async ({ page }) => {
  test.setTimeout(90_000);
  await openHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'off' : 'on');
  await expect(guide(page)).toBeHidden();
  await page.getByRole('button', { name: 'まずは練習（3 分）' }).click();

  await expectStep(page, '1 / 6', '準備ができたら始めよう');
  await expect(target(page)).toHaveAttribute('data-anchor', 'preflight');
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });

  await expectStep(page, '2 / 6', '何が起きたか読んでみよう');
  await expect(guide(page)).toContainText('準備 OK！');
  await expect(target(page)).toHaveAttribute('data-anchor', 'briefing');
  await guide(page).getByRole('button', { name: '場所を表示' }).click();
  await expect(page.locator('[data-anchor="briefing"]')).toBeFocused();
  await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();

  // 案内先が閉じたタブの中にあるときは、そのタブを指す。開くと中の案内先を指す
  await expectStep(page, '3 / 6', 'こわしてみよう');
  await expect(guide(page)).toContainText('今回の依頼を確認できました！');
  await expect(target(page)).toHaveAttribute('role', 'tab');
  await expect(target(page)).toHaveText('調査');
  await page.getByRole('tab', { name: '調査' }).click();
  await expect(target(page)).toHaveAttribute('data-anchor', 'actions');
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(seals(page)).toContainText('再現：達成');

  // 「場所を表示」は、案内先のタブを開いてフォーカスを移す
  await expectStep(page, '4 / 6', 'なおし方を選ぼう');
  await expect(guide(page)).toContainText('保存できてしまいました');
  await expect(target(page)).toHaveText('対策');
  await guide(page).getByRole('button', { name: '場所を表示' }).click();
  await expect(page.getByRole('tab', { name: '対策' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-anchor="defense-panel"]')).toBeFocused();

  // 不十分な対策では「おしい！」と次の手を示し、正しい対策で次へ進む
  await verifyWith(page, '入力欄で 41 文字目を打てなくする');
  await expectStep(page, '5 / 6', 'たしかめよう');
  await expect(guide(page).locator('.guide-retry')).toContainText('おしい！', { timeout: 15_000 });
  await expect(guide(page).locator('.guide-praise')).toHaveCount(0);
  await verifyWith(page, '保存するときに文字数を確かめる');
  await expect(seals(page)).toContainText('防御：達成', { timeout: 15_000 });

  await expectStep(page, '6 / 6', 'ふりかえろう');
  await expect(guide(page)).toContainText('合格！ 攻撃を防げました');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: 'コメントを保存するときに文字数を確かめる' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');

  await expect(guide(page).locator('.guide-count')).toHaveText('完了');
  await expect(guide(page).getByRole('heading', { level: 3 })).toHaveText('練習クリア！');
  await expect(guide(page).getByRole('list', { name: '練習の手順' })).not.toContainText('飛ばした');
  await guide(page).getByRole('button', { name: '課題一覧へ' }).click();

  // 練習を終えたら、一覧の「まずは練習」は出さない
  await expect(guide(page)).toBeHidden();
  await expect(page.getByRole('button', { name: /まずは練習/ })).toHaveCount(0);
  await expect(page.locator('[data-mission="onboarding"] .mission-progress')).toContainText('完了');
  await expect(page.locator('[data-mission="onboarding"]').getByRole('list', { name: '達成印' })).toContainText('理解：達成');
});

test('調査で送ったメモが、プレビューの最初の画面に出る', async ({ page }) => {
  await startMission(page, 'onboarding');
  const frame = preview(page);
  await page.getByRole('tab', { name: '調査' }).click();
  const title = await page.getByLabel('タイトル（49 文字）').inputValue();
  await expect(frame.getByRole('button', { name: title })).toHaveCount(0);

  await page.getByRole('button', { name: '送る', exact: true }).click();

  const posted = page.locator('.log-entry').filter({ hasText: 'POST /api/memos' }).first();
  await expect(posted.locator('.status')).toHaveText(/201/);
  await expect(frame.getByRole('heading', { name: 'メモ帳' })).toBeVisible();
  await expect(frame.getByRole('button', { name: title })).toBeVisible();
});

test('「入力欄で 41 文字目を打てなくする」を適用すると、画面のタイトル入力欄に上限が付く', async ({ page }) => {
  await startMission(page, 'onboarding');
  const frame = preview(page);
  await frame.getByRole('button', { name: '＋ 新しいメモ' }).click();
  await expect(frame.getByLabel('タイトル')).not.toHaveAttribute('maxlength');

  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: /入力欄で 41 文字目を打てなくする/ }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await frame.getByRole('button', { name: '＋ 新しいメモ' }).click();
  await expect(frame.getByLabel('タイトル')).toHaveAttribute('maxlength', '40');
});

test('ガイドのステップは飛ばせる。練習用でない課題を始めるとガイドは閉じる', async ({ page }) => {
  await startMission(page, 'onboarding');
  await expectStep(page, '3 / 6', 'こわしてみよう');
  await guide(page).getByRole('button', { name: 'このステップを飛ばす' }).click();
  await expectStep(page, '4 / 6', 'なおし方を選ぼう');
  await expect(guide(page).locator('.guide-praise')).toHaveCount(0);
  await expect(guide(page).getByRole('list', { name: '練習の手順' })).toContainText('こわしてみよう：飛ばした');

  await backToList(page).click();
  await expect(guide(page)).toBeVisible();
  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }).click();
  await expect(guide(page)).toBeHidden();
  await expect(target(page)).toHaveCount(0);
});
