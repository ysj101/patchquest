// 擬似シェル（ターミナル）と、操作で直す課題の学習UI。端末で調べて再現し、設定を書き換えた操作が記録され、検証の前に再生されることを確かめる
import type { Page } from '@playwright/test';
import { expect, loginToTerminal as loginAs, preview, resetToInitial, startMission, terminalInput as commandInput, terminalOutput, test, ticketSeals as seals, typeCommand as type, verifyResults } from './fixtures';

const OPERATORS = '/etc/sudoers.d/operators';
const repairPanel = (page: Page) => page.getByRole('tabpanel', { name: '対策' });

/** 管理者として、運用担当向けの設定の 1 行をコメントに書き換える */
const commentOut = (page: Page, line: number) => type(page, `sudo edit ${OPERATORS} ${line} '# 外した'`);

test.beforeEach(async ({ page }) => {
  await startMission(page, 'shell-test-pack');
  await expect(commandInput(page)).toBeVisible();
});

test('端末でコマンドを実行でき、未実装のコマンドや対応していない書き方は理由を示して断る', async ({ page }) => {
  await type(page, 'whoami');
  await expect(terminalOutput(page).locator('.term-out')).toHaveText(/^[a-z]+$/);
  await type(page, 'cd /etc');
  await expect(preview(page).locator('.term-prompt')).toHaveText(/:\/etc\$$/);
  await type(page, 'ls');
  await expect(terminalOutput(page)).toContainText('sudoers.d/');
  await type(page, 'cat hostname | wc');
  await expect(terminalOutput(page).locator('.term-err')).toContainText('「|」には対応していません');
  await type(page, 'vi sudoers');
  await expect(terminalOutput(page).locator('.term-err').last()).toHaveText('sh: vi: command not found');

  // 観測ログには、端末に打った形で残る
  await expect(page.locator('.log-entry').filter({ hasText: 'operator → $ whoami' })).toHaveCount(1);
});

test('キーボードだけでコマンドを送り、↑ で前のコマンドを呼び出せる', async ({ page }) => {
  await commandInput(page).focus();
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(terminalOutput(page).locator('.term-out')).toHaveText(/^\/home\/[a-z]+$/);
  // 応答が返ると入力欄へフォーカスが戻るので、そのまま続けて打てる
  await expect(commandInput(page)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(commandInput(page)).toHaveValue('pwd');
  await page.keyboard.press('ArrowDown');
  await expect(commandInput(page)).toHaveValue('');
});

test('過剰な許可を調べて再現し、端末の操作で外すと、記録した操作が再生されて検証に合格する', async ({ page }) => {
  await type(page, 'sudo -l');
  await expect(terminalOutput(page)).toContainText('/usr/local/sbin/');
  const maintenance = (await terminalOutput(page).innerText()).match(/\/usr\/local\/sbin\/[a-z-]+/)?.[0];
  if (!maintenance) throw new Error('保守の操作が sudo -l に出ていません');
  await type(page, `sudo ${maintenance}`);
  await expect(terminalOutput(page)).toContainText('保守操作を実行しました');
  await expect(seals(page)).toContainText('再現：達成');

  // 調べるだけの操作は、加えた変更にならない
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  await expect(page.getByRole('button', { name: '攻撃と普段の使い方を検証する' })).toBeDisabled();
  await expect(repairPanel(page).getByRole('button', { name: 'この対策を適用する' })).toHaveCount(0);

  await loginAs(page, 'admin');
  await type(page, `sudo edit ${OPERATORS}`);
  await expect(terminalOutput(page)).toContainText(`NOPASSWD: ${maintenance}`);
  await commentOut(page, 3);
  await expect(terminalOutput(page)).toContainText('3 行目を書き換えました');
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([`admin → $ sudo edit ${OPERATORS} 3 '# 外した'`]);
  await expect(repairPanel(page)).toContainText('加えた変更：1 件');
  await expect(page.locator('.state-stamp')).toHaveText('修正中');

  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');

  // 演習中の機械でも、同じ操作が拒否されるようになっている
  await loginAs(page, 'operator');
  await type(page, `sudo ${maintenance}`);
  await expect(terminalOutput(page).locator('.term-err')).toContainText('is not allowed to execute');
});

test('絞りすぎると普段の使い方の失敗で合格せず、初期状態へ戻すと加えた変更が消える', async ({ page }) => {
  await loginAs(page, 'admin');
  await commentOut(page, 2);
  await commentOut(page, 3);
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page).locator('.repair-log li')).toHaveCount(2);

  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
  await expect(verifyResults(page)).toContainText('まだ合格ではありません 普段の使い方が壊れています。', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：未達成');
  // 選び直す対策はないので、選び直しのボタンは出ない
  await expect(page.getByRole('button', { name: /対策を選び直す/ })).toHaveCount(0);

  await resetToInitial(page);
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
});
