// ヘッダーの PatchQuest ロゴから課題一覧へ戻る（#123）
import type { Page } from '@playwright/test';
import { enterWorkbench, expect, openHome, openRecords, tabTo, test } from './fixtures';

const logo = (page: Page) => page.getByRole('button', { name: 'PatchQuest（課題一覧へ戻る）' });
const missionHeading = (page: Page) => page.getByRole('heading', { level: 1, name: '課題', exact: true });
const testPack = (page: Page) => page.locator('[data-mission="test-pack"]');

/** 一覧の見出しに印を付ける。showList は子を描き直すので、印が残っていれば描き直していない */
async function markList(page: Page): Promise<void> {
  await page.locator('#hero-title').evaluate((heading) => {
    heading.dataset.kept = '1';
  });
}

/**
 * 一覧を描き直していないこと。
 * showList は保存を読み直してから見出しを作り直し、そこへフォーカスを移す。
 * 印が残り、見出しの子が入れ替わらなければ、ロゴは一覧を描き直していない
 */
async function expectListKept(page: Page): Promise<void> {
  await expect(page.locator('#hero-title')).toHaveAttribute('data-kept', '1');
  const kept = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const list = document.querySelector('.list-view');
    const heading = document.getElementById('hero-title');
    if (!list || heading?.dataset.kept !== '1') {
      resolve(false);
      return;
    }
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve(false);
    });
    observer.observe(list, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      const still = heading.isConnected && heading.dataset.kept === '1' && document.activeElement !== heading;
      resolve(still);
    }, 2_000);
  }));
  expect(kept).toBe(true);
}

/** キーボードの Tab だけでロゴへフォーカスを移す */
async function tabToLogo(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await tabTo(page, logo(page));
  await expect(logo(page)).toBeFocused();
}

test('演習画面・準備画面・記録ページからロゴで課題一覧に戻り、続きから再開できる', async ({ page }) => {
  await openHome(page);
  await expect(logo(page).locator('.brand-mark')).toHaveAttribute('alt', '');
  await expect(logo(page)).toContainText('PatchQuest');

  await openRecords(page);
  await logo(page).click();
  await expect(missionHeading(page)).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'ページ' }).getByRole('button', { name: '課題' })).toHaveAttribute('aria-current', 'page');

  await testPack(page).getByRole('button', { name: 'この課題を始める' }).click();
  await expect(page.getByRole('button', { name: '演習を始める' })).toBeVisible({ timeout: 15_000 });
  await logo(page).click();
  await expect(missionHeading(page)).toBeFocused();

  const resume = testPack(page).getByRole('button', { name: '続きから始める' });
  await (await resume.isVisible() ? resume : testPack(page).getByRole('button', { name: 'この課題を始める' })).click();
  await enterWorkbench(page);
  const ticket = await page.locator('.ticket-id').textContent();
  if (!ticket) throw new Error('演習票がありません');
  await logo(page).click();
  await expect(missionHeading(page)).toBeFocused();
  await expect(testPack(page)).toHaveAttribute('data-progress', 'doing');
  await testPack(page).getByRole('button', { name: '続きから始める' }).click();
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).toHaveText(ticket);
});

test('課題一覧を表示しているときにロゴを押しても一覧を描き直さない', async ({ page }) => {
  await openHome(page);
  await markList(page);
  await logo(page).click();
  await expect(logo(page)).toBeFocused();
  await expectListKept(page);
});

test('ロゴはキーボードで操作でき、フォーカスが見える', async ({ page }) => {
  await openHome(page);
  await tabToLogo(page);
  await expect(logo(page)).toHaveCSS('outline-style', 'solid');

  await markList(page);
  await page.keyboard.press('Enter');
  await expectListKept(page);

  await testPack(page).getByRole('button', { name: 'この課題を始める' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '開始前チェック' })).toBeVisible();
  await tabToLogo(page);
  await page.keyboard.press('Space');
  await expect(missionHeading(page)).toBeFocused();
});
