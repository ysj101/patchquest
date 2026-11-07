// 練習の全6項目で、操作ガイドと案内先が画面サイズやスクロールに隠れないことを確かめる。
import type { Page } from '@playwright/test';
import { expectGuide } from '../../.cursor/skills/verify-patchquest/guide-visibility.mjs';
import { expect, openHome, test, ticketSeals } from './fixtures';

/** 案内文を読み、案内先を表示しても同じ文が読めることを確かめる。 */
async function readGuide(page: Page, title: string, anchor: string): Promise<void> {
  await expectGuide(page, title);
  await page.getByRole('complementary', { name: '操作ガイド' }).getByRole('button', { name: '場所を表示' }).click();
  await expectGuide(page, title, true);
  await expect(page.locator('[data-guide-target]')).toHaveAttribute('data-anchor', anchor);
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}×${viewport.height} で練習の案内を全6項目読み、案内先を操作できる`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await openHome(page);
    await page.getByRole('button', { name: 'まずは練習（3 分）' }).click();
    await readGuide(page, '準備ができたら始めよう', 'preflight');
    await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });

    await readGuide(page, '何が起きたか読んでみよう', 'briefing');
    await page.getByRole('button', { name: 'ミッション開始', exact: true }).click();

    await readGuide(page, 'こわしてみよう', 'actions');
    expect((await page.getByLabel('タイトル（49 文字）').inputValue()).length, '40文字を超えるタイトルのまま送る').toBeGreaterThan(40);
    await page.getByRole('button', { name: '送る', exact: true }).click();
    await expect(ticketSeals(page)).toContainText('再現：達成');

    await readGuide(page, 'なおし方を選ぼう', 'defense-panel');
    await page.getByRole('radio', { name: /保存するときに文字数を確かめる/ }).check();
    await page.getByRole('button', { name: 'この対策を適用する' }).click();

    await readGuide(page, 'たしかめよう', 'verify');
    await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
    await expect(ticketSeals(page)).toContainText('防御：達成', { timeout: 20_000 });

    await readGuide(page, 'ふりかえろう', 'debrief');
    await page.getByRole('radio', { name: 'コメントを保存するときに文字数を確かめる' }).check();
    await page.getByRole('button', { name: '回答する' }).click();
    await expect(ticketSeals(page)).toContainText('理解：達成');
    await expectGuide(page, '練習クリア！');
  });
}
