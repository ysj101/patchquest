// 状況タブの「仕組みの例」（Issue #87）。3 ミッションで閉じた状態で表示され、開くと手順が読め、正解の対策は書かれていない
import type { Page } from '@playwright/test';
import { expect, startMission, test } from './fixtures';

const example = (page: Page) => page.getByRole('tabpanel', { name: '状況' }).locator('.worked-example');

/** 例に含めてはいけない、正解の対策を示す記述 */
const SOLUTION_WORDS: Record<string, RegExp[]> = {
  idor: [/ownerId !== user\.id/, /所有者を照合/, /403/],
  'stored-xss': [/textContent/, /エスケープ/, /文字として表示する対策/],
  sqli: [/バインド/, /owner_id = \?/, /プレースホルダ/],
};

for (const [missionId, forbidden] of Object.entries(SOLUTION_WORDS)) {
  test(`${missionId}：状況タブの仕組みの例は閉じた状態で出て、開くと手順が読め、対策の正解を含まない`, async ({ page }) => {
    await startMission(page, missionId);
    const details = example(page);
    await expect(details).toBeVisible();
    await expect(details).not.toHaveAttribute('open', '');
    await expect(details.getByRole('heading', { name: '仕組みの例' })).toBeVisible();
    const steps = details.locator('.worked-example-steps li');
    await expect(steps.first()).toBeHidden();

    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(steps.first()).toBeVisible();
    expect(await steps.count()).toBeGreaterThanOrEqual(3);
    await expect(steps.first()).toContainText('入力');
    await expect(steps.last()).toContainText('結果');
    await expect(details).toContainText('ここから分かること');
    await expect(details).toContainText('対策は書いていません');

    const text = await details.innerText();
    for (const word of forbidden) expect(text, `${missionId} の例に対策の正解（${word}）が含まれている`).not.toMatch(word);
  });
}

test('例を持たない練習課題では、状況タブに仕組みの例を出さない', async ({ page }) => {
  await startMission(page, 'onboarding');
  await expect(page.getByRole('tabpanel', { name: '状況' })).toContainText('守るもの');
  await expect(example(page)).toHaveCount(0);
});
