// 演出の設定（Issue #64）。動きと効果音を端末ごとに保存し、動きオフでは @keyframes を止める
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const settingsButton = (page: Page, scope: string) => page.locator(scope).getByRole('button', { name: '演出の設定' });
const dialog = (page: Page) => page.getByRole('dialog', { name: '演出の設定' });
const choice = (page: Page, group: string, name: string) => dialog(page).getByRole('group', { name: group }).getByRole('radio', { name });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function progressFile(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('進捗 JSON として読み込めません');
  }
  if (!isRecord(value)) throw new Error('進捗 JSON がオブジェクトではありません');
  return value;
}

async function keyframeNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document.getAnimations().flatMap((anim) => (anim instanceof CSSAnimation && anim.playState === 'running' ? [anim.animationName] : [])),
  );
}

async function openSettings(page: Page, scope = '.site-header'): Promise<void> {
  await settingsButton(page, scope).click();
  await expect(dialog(page)).toBeVisible();
}

test('動きの初期値は端末の「動きを減らす」に従い、効果音はオフ', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');

  await openSettings(page);
  await expect(dialog(page)).toContainText('オフにしても、課題は最後まで進められます');
  await expect(choice(page, '動き', 'オフ')).toBeChecked();
  await expect(choice(page, '効果音', 'オフ')).toBeChecked();
  await expect(dialog(page).getByRole('slider', { name: '音量' })).toHaveValue('1');
  await expect(dialog(page).getByText('100%', { exact: true })).toBeVisible();
});

test('動きを減らす設定がなければ、動きの初期値はオン', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await openSettings(page);
  await expect(choice(page, '動き', 'オン')).toBeChecked();
});

test('動きを選ぶまでは端末の設定に従い、選んだあとはそれを保持する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');

  // 音量だけ変えても、動きは端末の設定のまま
  await openSettings(page);
  await dialog(page).getByRole('slider', { name: '音量' }).fill('0.5');
  await dialog(page).getByRole('button', { name: '閉じる' }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');

  await openSettings(page);
  // いったんオフにしてからオンに戻す。はじめから選ばれているラジオを押しても変更は起きない
  await choice(page, '動き', 'オフ').check();
  await choice(page, '動き', 'オン').check();
  await dialog(page).getByRole('button', { name: '閉じる' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
});

test('一覧と演習のヘッダーから設定でき、再読み込み後も保持され、進捗ファイルには含まれない', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await openSettings(page);
  await choice(page, '動き', 'オフ').check();
  await choice(page, '効果音', 'オン').check();
  await dialog(page).getByRole('slider', { name: '音量' }).fill('0.4');
  await expect(dialog(page).getByText('40%', { exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: '閉じる' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  const file = await download;
  const exported = progressFile(await (await file.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8')));
  expect(exported).toEqual({ format: 'patchquest-progress', schemaVersion: 1, exportedAt: expect.any(String), attempts: [] });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await openSettings(page);
  await expect(choice(page, '動き', 'オフ')).toBeChecked();
  await expect(choice(page, '効果音', 'オン')).toBeChecked();
  await expect(dialog(page).getByRole('slider', { name: '音量' })).toHaveValue('0.4');
  await dialog(page).getByRole('button', { name: '閉じる' }).click();

  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: 'この課題を始める' }).click();
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await openSettings(page, '.ticket');
  await expect(choice(page, '動き', 'オフ')).toBeChecked();
  await expect(choice(page, '効果音', 'オン')).toBeChecked();
});

test('キーボードだけで動き・効果音・音量を変えられる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  // 一覧を開くと見出しへフォーカスが移る。ヘッダーの設定はその一つ手前
  await expect(page.getByRole('heading', { level: 1, name: 'わざと壊したアプリで、こわして、なおして、たしかめる。' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(settingsButton(page, '.site-header')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(choice(page, '動き', 'オン')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(choice(page, '動き', 'オフ')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(choice(page, '効果音', 'オフ')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(choice(page, '効果音', 'オン')).toBeChecked();
  const slider = dialog(page).getByRole('slider', { name: '音量' });
  await page.keyboard.press('Tab');
  await expect(slider).toBeFocused();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(dialog(page).getByText('0%', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(settingsButton(page, '.site-header')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.reload();
  await openSettings(page);
  await expect(choice(page, '効果音', 'オン')).toBeChecked();
  await expect(dialog(page).getByRole('slider', { name: '音量' })).toHaveValue('0');
});

const practiceButton = (page: Page) => page.getByRole('button', { name: 'まずは練習（3 分）' });

test('動きをオフにすると @keyframes が走らず、オンに戻すと再び走る', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(practiceButton(page).evaluate((el) => getComputedStyle(el).transitionDuration)).resolves.toBe('0.05s, 0.05s');
  await practiceButton(page).click();
  await expect(page.locator('[data-guide-target]')).toBeVisible();
  await expect.poll(() => keyframeNames(page)).toContain('guide-pulse');

  await openSettings(page);
  await choice(page, '動き', 'オフ').check();
  await page.keyboard.press('Escape');
  // ダイアログを閉じたあとに確かめる。開いたままでは背面が inert になり、アニメーションが止まることがある
  await expect.poll(() => keyframeNames(page)).toEqual([]);
  await expect(page.locator('.button-chunky').first().evaluate((el) => getComputedStyle(el).transitionDuration)).resolves.toBe('0s');

  await page.reload();
  await practiceButton(page).click();
  await expect(page.locator('[data-guide-target]')).toBeVisible();
  await expect.poll(() => keyframeNames(page)).toEqual([]);

  await openSettings(page);
  await choice(page, '動き', 'オン').check();
  await page.keyboard.press('Escape');
  await expect.poll(() => keyframeNames(page)).toContain('guide-pulse');
});

test('ブラウザに保存できないときはメモリで続け、読み直すと初期値に戻る', async ({ page }) => {
  await page.addInitScript(() => {
    const reject = (): never => {
      throw new DOMException('blocked for test', 'SecurityError');
    };
    Storage.prototype.getItem = reject;
    Storage.prototype.setItem = () => reject();
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await openSettings(page);
  await expect(dialog(page)).toContainText('ブラウザに保存できません');
  await choice(page, '動き', 'オフ').check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
});

test('壊れた設定は捨てて初期値に戻す', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('patchquest.effects', '{"sound":true,"volume":5}');
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('patchquest.effects'))).toBeNull();
  await openSettings(page);
  await expect(choice(page, '効果音', 'オフ')).toBeChecked();
  await expect(dialog(page).getByRole('slider', { name: '音量' })).toHaveValue('1');
});
