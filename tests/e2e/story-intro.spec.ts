// ミッション開始時の事件の提示（Issue #65）。開始前チェックの後、同じ演習画面の状態として出す
import type { Page } from '@playwright/test';
import { dismissStoryIntro, expect, test } from './fixtures';

const intro = (page: Page) => page.getByRole('dialog', { name: 'SECURITY ALERT' });

/** 課題を始め、事件の提示が開くまで待つ */
async function openIntro(page: Page, missionId: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-mission="${missionId}"]`).getByRole('button', { name: 'この課題を始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(intro(page)).toBeVisible();
}

test('非公開メモの課題は、初回に事件の提示を出し、閉じても教材アプリを作り直さない', async ({ page }) => {
  await openIntro(page, 'idor');
  const alert = intro(page);
  await expect(alert.getByRole('heading', { name: 'SECURITY ALERT' })).toBeVisible();
  await expect(alert).toContainText('知らない人の非公開メモ');
  await expect(alert).toContainText('書いた本人（所有者）だけが読める');
  await expect(alert).toContainText('学習用に脆弱性を注入した架空のサービスです。');
  await expect(alert.getByRole('button', { name: 'MISSION START' })).toBeFocused();

  const frame = page.locator('.preview-slot iframe');
  await expect(frame).toHaveCount(1);
  await frame.evaluate((element) => {
    element.dataset.kept = 'yes';
  });
  await alert.getByRole('button', { name: 'MISSION START' }).click();
  await expect(page.locator('.exercise')).toHaveAttribute('data-intro', 'closed');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('data-kept', 'yes');
  await expect(page.locator('#exercise-title')).toBeFocused();

  await page.getByRole('tab', { name: '状況' }).click();
  await page.getByRole('button', { name: '事件の提示を読み直す' }).click();
  await expect(intro(page)).toContainText('知らない人の非公開メモ');
  await page.keyboard.press('Escape');
  await expect(page.locator('#exercise-title')).toBeFocused();
  await expect(frame).toHaveAttribute('data-kept', 'yes');
});

test('同じ課題の 2 回目は事件の提示を出さず、進捗を消すとまた出す', async ({ page }) => {
  await openIntro(page, 'idor');
  await dismissStoryIntro(page);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();

  await page.locator('[data-mission="idor"]').getByRole('button', { name: '最初から始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(page.locator('.exercise')).toHaveAttribute('data-intro', 'closed');
  await expect(intro(page)).toBeHidden();
  await expect(page.locator('#exercise-title')).toBeFocused();

  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await page.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.getByRole('dialog', { name: '進捗をすべて削除しますか？' }).getByRole('button', { name: '削除する' }).click();
  await expect(page.locator('[data-mission="idor"]').getByRole('button', { name: 'この課題を始める' })).toBeVisible();
  await openIntro(page, 'idor');
  await expect(intro(page)).toContainText('知らない人の非公開メモ');
});

test('コメントの課題は事件の提示を出して、ボタンで演習に入れる', async ({ page }) => {
  await openIntro(page, 'stored-xss');
  await expect(intro(page)).toContainText('プログラムとして動いている');
  await expect(intro(page)).toContainText('文字として表示します');
  await dismissStoryIntro(page);
  await expect(page.getByRole('tab', { name: '状況' })).toBeVisible();
  await expect(page.locator('.preview-slot iframe')).toHaveCount(1);
});

test('検索の課題は Enter キーで事件の提示をスキップできる', async ({ page }) => {
  await openIntro(page, 'sqli');
  await expect(intro(page)).toContainText('bob さんの非公開のメモ');
  await expect(intro(page)).toContainText('検索した本人のメモだけ');
  await expect(intro(page).getByRole('button', { name: 'MISSION START' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.exercise')).toHaveAttribute('data-intro', 'closed');
  await expect(page.locator('#exercise-title')).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: '検索条件からの情報漏えいを防ぐ' })).toBeVisible();
});

test('練習課題は事件の提示を閉じたあと、操作ガイドが演習の手順に進む', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'まずは練習（3 分）' }).click();
  await expect(page.getByRole('complementary', { name: '操作ガイド' }).locator('.guide-count')).toHaveText('1 / 5');
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });

  await expect(intro(page)).toContainText('40 文字までの決まり');
  await expect(intro(page)).toContainText('40 文字を超えるタイトルは保存されない');
  await expect(intro(page)).toContainText('学習用に脆弱性を注入した架空のサービスです。');
  // started は導入を閉じるまで進まない。ガイドはモーダルの下で最初のステップのまま
  await expect(page.getByRole('complementary', { name: '操作ガイド' }).locator('.guide-count')).toHaveText('1 / 5');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: '操作ガイド' }).locator('.guide-count')).toHaveText('2 / 5');
  await expect(page.getByRole('complementary', { name: '操作ガイド' }).getByRole('heading', { level: 3 })).toHaveText('こわしてみよう');
  await expect(page.locator('.preview-slot iframe')).toHaveCount(1);
});
