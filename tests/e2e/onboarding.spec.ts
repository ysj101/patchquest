// オンボーディング（練習用パック、Issue #15）。カタログに登録しただけで一覧に出て、
// 操作ガイドに沿って一覧 → 開始前チェック → … → 進捗の書き出しまで最後まで進められる
import type { Page } from '@playwright/test';
import { expect, preview, startMission, test, ticketSeals as seals, verifyWith } from './fixtures';

const guide = (page: Page) => page.getByRole('complementary', { name: '操作ガイド' });

/** ガイドが指定のステップを示し、その案内先に印が付いている（案内先が今の画面になければ印はない） */
async function expectStep(page: Page, count: string, title: string, anchor: string | null): Promise<void> {
  await expect(guide(page).locator('.guide-count')).toHaveText(count);
  await expect(guide(page).getByRole('heading', { level: 3 })).toHaveText(title);
  if (anchor) await expect(page.locator('[data-guide-target]')).toHaveAttribute('data-anchor', anchor);
  else await expect(page.locator('[data-guide-target]')).toHaveCount(0);
}

async function expectVerdict(page: Page, defense: string, verdict: string): Promise<void> {
  await verifyWith(page, defense);
  await expect(page.locator('[data-anchor="results"]')).toContainText(verdict, { timeout: 15_000 });
}

test('操作ガイドに沿って、練習用パックを最後まで進められる', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const practice = page.locator('.mission-section').filter({ has: page.getByRole('heading', { level: 2, name: '練習' }) });
  await expect(practice.locator('[data-mission]')).toHaveCount(1);
  await expect(guide(page)).toBeHidden();
  await practice.locator('[data-mission="onboarding"]').getByRole('button', { name: 'この課題を始める' }).click();

  await expectStep(page, '1 / 11', '開始前チェックを確かめる', 'preflight');
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });

  await expectStep(page, '2 / 11', '利用者を切り替える', 'user-switcher');
  await page.getByRole('radio', { name: /^bob/ }).check();

  // 「場所を表示」は、案内先が隠れたタブにあればそのタブを開く
  await expectStep(page, '3 / 11', 'リクエストを送ってみる', 'actions');
  await guide(page).getByRole('button', { name: '場所を表示' }).click();
  await expect(page.getByRole('tab', { name: '調査' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-anchor="actions"]')).toBeFocused();
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(page.locator('.log-entry').first()).toContainText('POST /api/memos');

  await expectStep(page, '4 / 11', 'リクエストを編集して、事故を再現する', 'request-editor');
  await page.getByRole('button', { name: '編集欄にコピー' }).click();
  await page.getByLabel('本文（JSON）').fill(JSON.stringify({ title: 'あ'.repeat(41), body: '長いタイトル' }));
  await page.getByRole('button', { name: 'このリクエストを送る' }).click();
  await expect(seals(page)).toContainText('再現：達成');

  await expectStep(page, '5 / 11', 'ヒントを開く', 'hints');
  await page.getByRole('tab', { name: '状況' }).click();
  await page.getByRole('button', { name: 'ヒント 1（着眼点）を見る' }).click();

  await expectStep(page, '6 / 11', '対策を選んで適用する', 'defense-panel');
  await expectVerdict(page, '入力欄だけで文字数を制限する', 'まだ合格ではありません');
  await expect(page.locator('[data-anchor="results"]')).toContainText('攻撃をまだ防げていません');

  await expectStep(page, '8 / 11', '結果を読み、別の対策で合格する', 'results');
  await expectVerdict(page, '保存処理でタイトルの長さを検証する', '防御できました');
  await expect(seals(page)).toContainText('防御：達成');

  await expectStep(page, '9 / 11', '振り返りで理解を確かめる', 'debrief');
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('radio', { name: 'コメントを保存する処理で文字数を確かめる' }).check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');

  await expectStep(page, '10 / 11', '初期状態へ戻す', 'reset');
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '初期状態へ戻す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '初期状態へ戻す' }).click();

  // 課題一覧へ戻っても、ガイドは最後の手順（進捗の書き出し）まで残る
  await expectStep(page, '11 / 11', '進捗を書き出す', null);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expectStep(page, '11 / 11', '進捗を書き出す', 'progress-export');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  await download;

  await expect(guide(page).locator('.guide-count')).toHaveText('完了');
  await expect(guide(page)).toContainText('練習はおしまいです');
  await expect(guide(page).getByRole('listitem')).toHaveCount(11);
  await expect(guide(page).getByRole('list', { name: '練習の手順' })).not.toContainText('飛ばした');
  await guide(page).getByRole('button', { name: 'ガイドを閉じる' }).click();
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('[data-mission="onboarding"]').getByRole('list', { name: '達成印' })).toContainText('理解：達成');
});

test('「入力欄だけで制限」を適用すると、画面のタイトル入力欄に上限が付く', async ({ page }) => {
  await startMission(page, 'onboarding');
  const frame = preview(page);
  await frame.getByRole('button', { name: '＋ 新しいメモ' }).click();
  await expect(frame.getByLabel('タイトル')).not.toHaveAttribute('maxlength');

  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: /入力欄だけで文字数を制限する/ }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await frame.getByRole('button', { name: '＋ 新しいメモ' }).click();
  await expect(frame.getByLabel('タイトル')).toHaveAttribute('maxlength', '40');
});

test('ガイドのステップは飛ばせる。練習用でない課題を始めるとガイドは閉じる', async ({ page }) => {
  await startMission(page, 'onboarding');
  await expectStep(page, '2 / 11', '利用者を切り替える', 'user-switcher');
  await guide(page).getByRole('button', { name: 'このステップを飛ばす' }).click();
  await expectStep(page, '3 / 11', 'リクエストを送ってみる', 'actions');
  await expect(guide(page).getByRole('list', { name: '練習の手順' })).toContainText('利用者を切り替える：飛ばした');

  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expect(guide(page)).toBeVisible();
  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }).click();
  await expect(guide(page)).toBeHidden();
  await expect(page.locator('[data-guide-target]')).toHaveCount(0);
});
