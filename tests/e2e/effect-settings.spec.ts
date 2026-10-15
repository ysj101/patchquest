// 演出設定の保存、動きの抑制、キーボード操作と保存失敗の通知を確認する。
import type { Page } from '@playwright/test';
import { test, expect, startMission, settingsButton, turnMotionOffWithKeyboard } from './fixtures';

const motionOff = (page: Page) => page.getByRole('radio', { name: 'オフ', exact: true });

test('演出設定を再読み込み後と演習画面でも利用できる', async ({ page }) => {
  await page.goto('/');
  await settingsButton(page).click();
  await expect(page.getByRole('radio', { name: 'OS の設定に従う' })).toBeChecked();
  await motionOff(page).check();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await startMission(page, 'idor');
  await settingsButton(page).click();
  await expect(motionOff(page)).toBeChecked();
});

test('OS の動きの設定と明示的なオン・オフを反映し keyframes と遷移を止める', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const target = page.locator('#hero-title');
  await target.evaluate((element) => element.setAttribute('data-guide-target', ''));
  await expect(target).toHaveCSS('animation-name', 'guide-pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(target).toHaveCSS('animation-name', 'none');
  await settingsButton(page).click();
  await page.getByRole('radio', { name: 'オン', exact: true }).check();
  await expect(target).toHaveCSS('animation-name', 'guide-pulse');
  await motionOff(page).check();
  await expect(target).toHaveCSS('animation-name', 'none');
  await expect(target).toHaveCSS('transition-property', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});

test('キーボードだけで設定を開いて変更し Esc で閉じ、元のボタンに戻る', async ({ page }) => {
  await page.goto('/');
  const button = settingsButton(page);
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press('Tab');
    if (await button.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  await turnMotionOffWithKeyboard(page);
});

test('保存領域が無効でもメモリで変更でき、保存不可を表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('保存禁止'); } });
  });
  await page.goto('/');
  await expect(page.getByText(/演出設定をブラウザに保存できません/)).toBeVisible();
  await settingsButton(page).click();
  await motionOff(page).check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.keyboard.press('Escape');
  await settingsButton(page).click();
  await expect(motionOff(page)).toBeChecked();
});

test('不正な保存データは理由を示して既定値に戻し、設定し直すと警告を解除する', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('patchquest.effect-settings.v1', '{'));
  await page.goto('/');
  await expect(page.getByText(/演出設定を既定値に戻しました/)).toBeVisible();
  await settingsButton(page).click();
  const dialog = page.getByRole('dialog', { name: '演出の設定' });
  await expect(dialog.getByRole('radio', { name: 'OS の設定に従う' })).toBeChecked();
  await dialog.getByRole('radio', { name: 'オフ', exact: true }).check();
  await expect(dialog.locator('.note')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/演出設定を既定値に戻しました/)).toHaveCount(0);
});
