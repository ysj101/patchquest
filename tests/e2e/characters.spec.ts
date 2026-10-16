// キャラクターの発言が実際の評価に連動し、演出オフでも読めることを確かめる。
import {
  expect, launchButton, openMission, reproduceNoteLeak, settingsButton, startMission,
  test, turnMotionOffWithKeyboard, verifyWith,
} from './fixtures';

const requester = '[data-character="requester"]';

test('導入に依頼人の話と案内役を名前・役割・顔付きで表示する', async ({ page }) => {
  await page.goto('/');
  await openMission(page, 'test-pack');
  const briefing = page.locator('[data-anchor="briefing"]');
  const voice = briefing.locator(requester);
  await expect(voice.locator('figcaption')).toHaveText('ノートの依頼人 · ノートアプリの利用者');
  await expect(voice.locator('blockquote')).toHaveText('他人のノートが見える');
  for (const name of ['依頼人 ノートの依頼人', '案内役 パッチ']) {
    const face = briefing.getByRole('img', { name, exact: true });
    await expect(face).toBeVisible();
    await expect.poll(() => face.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(briefing.locator('[data-character="guide"]')).toContainText('まずは何が起きたか、本人の話を聞こう。');
  await expect(launchButton(page)).toBeFocused();
});

for (const motionOff of [false, true]) {
  test(`再現・防御・振り返りに反応し、不十分な対策には依頼人を出さない（動きオフ：${motionOff}）`, async ({ page }) => {
    await startMission(page, 'test-pack');
    if (motionOff) {
      await settingsButton(page).focus();
      await turnMotionOffWithKeyboard(page);
      await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    }
    await page.getByRole('tab', { name: '調査' }).click();
    await reproduceNoteLeak(page);
    const callout = page.locator('.result-callout');
    const live = page.locator('[aria-live="polite"]');
    await expect(callout.locator(requester)).toContainText('ほかの人のノートまで読めてしまうんだね。');
    await expect(live).toContainText('ノートの依頼人。ほかの人のノートまで読めてしまうんだね。');
    await verifyWith(page, 'すべて拒否する');
    await expect(callout).toHaveAttribute('data-result', 'insufficient', { timeout: 15_000 });
    await expect(callout.locator(requester)).toHaveCount(0);
    await expect(live).not.toContainText('ノートの依頼人');
    await verifyWith(page, '所有者を照合する');
    await expect(callout).toHaveAttribute('data-result', 'secured', { timeout: 15_000 });
    await expect(callout.locator(requester)).toContainText('守ってくれてありがとう。');
    await expect(live).toContainText('ノートの依頼人。守ってくれてありがとう。');
    await page.getByRole('tab', { name: '振り返り' }).click();
    await expect(page.locator('[data-anchor="debrief"]').locator(requester)).toContainText('誰のノートかを確かめるんだね。');
  });
}

test('練習課題の操作ガイドはパッチの名前と顔で案内する', async ({ page }) => {
  await startMission(page, 'onboarding');
  const guide = page.getByRole('complementary', { name: '操作ガイド' });
  await expect(guide.getByRole('heading', { name: 'パッチの操作ガイド', exact: true })).toHaveText('パッチの操作ガイド');
  await expect(guide.getByRole('img', { name: '案内役 パッチ', exact: true })).toBeVisible();
});
