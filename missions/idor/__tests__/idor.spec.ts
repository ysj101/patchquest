// ミッション1「非公開メモを守る」（IDOR、Issue #17）。カタログに登録しただけで一覧に出て、
// 画面の「前のメモ」から別の利用者の非公開メモを開いて再現し、リンクを隠すだけでは不合格（A06）、
// すべて断ると正常系が壊れ（A05）、所有者の照合で合格する（A07）
import type { Page } from '@playwright/test';
import { expect, expectCalloutMatchesVerdict, preview, startMission, test, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** bob の非公開メモを開き、「前のメモ」で bob のもう 1 つのメモ（一つ前の番号）へ移る */
async function openBobsFirstMemo(page: Page): Promise<void> {
  const app = preview(page);
  await app.getByRole('button', { name: '非公開のメモ' }).click();
  await expect(app.getByText('（bob）')).toBeVisible();
  await app.getByRole('button', { name: '← 前のメモ' }).click();
  await expect(app.getByRole('button', { name: '次のメモ →' })).toBeVisible();
}

test('画面の「前のメモ」から事故を再現し、リンクを隠すだけ・すべて断るでは不合格、所有者の照合で合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('[data-mission="idor"]').getByRole('heading', { name: '非公開メモを守る' })).toBeVisible();
  await startMission(page, 'idor');
  const app = preview(page);

  // 再現：bob の最初のメモの「前のメモ」は、番号が隣の alice の非公開メモ
  await page.getByRole('radio', { name: /^bob/ }).check();
  await expect(app.getByText('bob さんとしてログイン中')).toBeVisible();
  await openBobsFirstMemo(page);
  await app.getByRole('button', { name: '← 前のメモ' }).click();
  await expect(app.getByText('（alice）')).toBeVisible();
  await expect(seals(page)).toContainText('再現：達成');

  // A06：リンクを隠すと画面からは辿れなくなるが、ID を直接指定した取得は通るので不合格
  await verifyWith(page, '画面のリンクだけを隠す');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('まだ合格ではありません 攻撃をまだ防げていません。', { timeout: 15_000 });
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await openBobsFirstMemo(page);
  await expect(app.getByRole('button', { name: '← 前のメモ' })).toHaveCount(0);

  // A05：すべての取得を断ると、所有者も自分のメモを読めない
  await verifyWith(page, 'ID 指定でのメモの取得をすべて断る');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('普段の使い方が壊れています', { timeout: 15_000 });

  // A07：所有者を照合すると合格。画面のリンクが残っていても、他人のメモは断られる
  await verifyWith(page, '取り出す処理で、ログイン中の利用者と所有者を照合する');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('防御できました', { timeout: 15_000 });
  await expect(seals(page)).toContainText('防御：達成');
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await openBobsFirstMemo(page);
  await app.getByRole('button', { name: '← 前のメモ' }).click();
  await expect(app.getByText('このメモを表示する権限がありません')).toBeVisible();

  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: '請求書を取り出す処理が、要求した会社がその請求書の持ち主かを確かめていない' }).check();
  await page.getByRole('radio', { name: '編集する処理で、セッションの利用者とコメントの投稿者を照合する' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');
});
