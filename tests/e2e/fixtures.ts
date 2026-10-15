import { test as base, expect, type Page } from '@playwright/test';

// すべてのE2Eテストで、localhost以外への通信を遮断し、発生したら失敗にする（spec §12, A19）
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const external: string[] = [];
      await context.route(
        (url) => url.origin !== origin && !['data:', 'blob:'].includes(url.protocol),
        (route) => {
          external.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      await use(external);
      expect(external, 'localhost以外への通信が発生した').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** 課題一覧の見出し。同梱課題の脆弱性名を、マニフェストの順に並べたもの */
export const missionListHeading = 'IDOR・保存型 XSS・SQL インジェクションを、壊れたメモアプリで練習する';

/** 課題一覧を開き、見出しを確かめて、その間のページエラーを返す */
export async function openMissionList(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: missionListHeading })).toBeVisible();
  return errors;
}

/** 演習画面の教材アプリ（隔離 iframe） */
export const preview = (page: Page) => page.frameLocator('.preview-slot iframe');
/** 検証結果のパネル */
export const verifyResults = (page: Page) => page.locator('[data-anchor="results"]');
/** 演習票の達成印 */
export const ticketSeals = (page: Page) => page.locator('.ticket').getByRole('list', { name: '達成印' });

/** 課題一覧から課題を始め、開始前チェックを終えて演習画面を開く */
export async function startMission(page: Page, missionId: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-mission="${missionId}"]`).getByRole('button', { name: 'この課題を始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
}

/** 対策パネルで対策を選んで適用し、検証を始める */
export async function verifyWith(page: Page, defense: string): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: new RegExp(defense) }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(page.getByText(`適用中の対策：${defense}`)).toBeVisible();
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
}
