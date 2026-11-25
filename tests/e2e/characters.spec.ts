// 導入の依頼人と操作ガイドの案内役を名前・顔つきで示し、再現・検証・振り返りには発言を出さないことを確かめる。
import { expect, launchButton, openHome, openMission, reproduceNoteLeak, startMission, test, verifyResults, verifyWith } from './fixtures';

const requester = '[data-character="requester"]';

test('導入に依頼人の話を名前・役割・顔付きで表示し、案内役の前置きは出さない', async ({ page }) => {
  await openHome(page);
  await openMission(page, 'test-pack');
  const briefing = page.locator('[data-anchor="briefing"]');
  const voice = briefing.locator(requester);
  await expect(voice.locator('figcaption')).toHaveText('ノートの依頼人 · ノートアプリの利用者');
  await expect(voice.locator('blockquote')).toHaveText('他人のノートが見える');
  const face = briefing.getByRole('img', { name: '依頼人 ノートの依頼人', exact: true });
  await expect(face).toBeVisible();
  await expect.poll(() => face.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(briefing.getByRole('img', { name: '案内役 パッチ' })).toHaveCount(0);
  await expect(briefing).toContainText('SECURITY ALERT');
  await expect(briefing).not.toContainText('Esc');
  await expect(launchButton(page)).toBeFocused();
});

test('再現・検証・振り返りには、依頼人や案内役の発言を出さない', async ({ page }) => {
  await startMission(page, 'test-pack');
  await reproduceNoteLeak(page);
  // 導入（閉じている）の依頼人は数えない
  const voices = page.locator('.result-callout [data-character], .workbench [data-character]');
  await expect(page.locator('.result-callout')).toContainText('セキュリティホールを再現できました');
  await expect(voices).toHaveCount(0);
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 15_000 });
  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.locator('[data-anchor="debrief"]')).toContainText('原因');
  await expect(voices).toHaveCount(0);
});

test('練習課題の操作ガイドはパッチの名前と顔で案内する', async ({ page }) => {
  await startMission(page, 'onboarding');
  const guide = page.getByRole('complementary', { name: '操作ガイド' });
  await expect(guide.getByRole('heading', { name: 'パッチの操作ガイド', exact: true })).toHaveText('パッチの操作ガイド');
  await expect(guide.getByRole('img', { name: '案内役 パッチ', exact: true })).toBeVisible();
});
