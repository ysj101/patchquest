// 擬似シェル（ターミナル）と、操作で直す課題の学習UI。端末で調べて再現し、visudo で設定を書き換えた操作が記録され、検証の前に再生されることを確かめる
import type { Page } from '@playwright/test';
import { commentOutWithVisudo, expect, loginToTerminal as loginAs, preview, resetToInitial, startMission, terminalEditor as editor, terminalInput as commandInput, terminalOutput, test, ticketSeals as seals, typeCommand as type, verifyResults } from './fixtures';

const OPERATORS = '/etc/sudoers.d/operators';
const repairPanel = (page: Page) => page.getByRole('tabpanel', { name: '対策' });

/** 管理者として、運用担当向けの設定の行を visudo でコメントに書き換えて保存する */
const commentOut = (page: Page, ...lines: number[]) => commentOutWithVisudo(page, OPERATORS, lines);

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

  await type(page, 'su admin');
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('「表示する利用者」で切り替えてください');
});

test('観測ログと調査タブは、HTTP のリクエストではなく端末の言葉で示す', async ({ page }) => {
  // 定型の操作がないので、調査タブを開くのではなく、教材アプリで調べるよう案内する
  await expect(page.locator('.now-doing')).toHaveText('今やること：教材アプリを操作して、手がかりを集めます。');
  await type(page, 'whoami');
  await type(page, 'cat /etc/sudoers');
  const log = page.locator('.log-section');
  // 見出しは端末に打った形で、結果の印は状態コードではなく終了コード
  const succeeded = log.locator('.log-entry').filter({ hasText: 'operator → $ whoami' });
  await expect(succeeded).toContainText('終了コード 0');
  const failed = log.locator('.log-entry').filter({ hasText: 'operator → $ cat /etc/sudoers' });
  await expect(failed).toContainText('終了コード 1');
  await expect(log.locator('.log-entry').filter({ hasText: 'operator → 端末を開く' })).toHaveCount(1);

  await failed.locator('summary').click();
  await expect(failed.locator('.log-block h4')).toHaveText(['コマンド', '端末の出力', '起きたこと']);
  await expect(failed).toContainText('cat: /etc/sudoers: Permission denied');
  await expect(log).not.toContainText('POST');
  await expect(log).not.toContainText('GET');
  await expect(log).not.toContainText('status');

  // 端末にコマンドを打てば足りるので、リクエストを手で組む欄は出さない
  await page.getByRole('tab', { name: '調査' }).click();
  const investigation = page.getByRole('tabpanel', { name: '調査' });
  await expect(investigation).toContainText('この課題には、決まった操作がありません。教材アプリの画面を操作して調べます。');
  await expect(investigation.getByRole('button', { name: '上級者向け' })).toBeHidden();
});

test('visudo の編集画面は、キーボードだけで開いて書き換えられ、読めない内容では保存せずに開いたままにする', async ({ page }) => {
  // 運用担当は開けない
  await type(page, `sudo visudo -f ${OPERATORS}`);
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('is not allowed to execute');
  await expect(editor(page)).toHaveCount(0);

  await loginAs(page, 'admin');
  await commandInput(page).focus();
  await page.keyboard.type(`sudo visudo -f ${OPERATORS}`);
  await page.keyboard.press('Enter');
  // 開くと 1 行目にフォーカスが移り、コマンドの入力欄は隠れる
  const first = editor(page).getByRole('textbox', { name: '1 行目', exact: true });
  await expect(first).toBeFocused();
  await expect(commandInput(page)).toBeHidden();
  await expect(editor(page).getByRole('textbox')).toHaveCount(3);

  // Esc で、保存せずに閉じる
  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect(terminalOutput(page)).toContainText('保存せずに閉じました');
  await expect(commandInput(page)).toBeFocused();

  // 読めない内容は保存されず、理由を示して編集画面は開いたまま
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(first).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('これは設定ではない');
  await page.keyboard.press('Control+s');
  await expect(editor(page).getByRole('alert')).toContainText(`visudo: ${OPERATORS}:2: 構文エラー`);
  await expect(editor(page).getByRole('alert')).toContainText('変更は保存していません');

  // 直して Ctrl+S で保存すると閉じ、加えた変更に 1 件だけ残る
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('# 外した');
  await page.keyboard.press('Control+s');
  await expect(editor(page)).toHaveCount(0);
  await expect(terminalOutput(page)).toContainText(`visudo: ${OPERATORS} の 2 行目を保存しました`);
  await expect(commandInput(page)).toBeFocused();
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([`admin → $ sudo visudo -f ${OPERATORS}（2 行目を「# 外した」に書き換えて保存）`]);

  // 何も変えずに保存しても、状態を変えたことにならない
  await type(page, `sudo visudo -f ${OPERATORS}`);
  await editor(page).getByRole('button', { name: /^保存して閉じる/ }).click();
  await expect(terminalOutput(page)).toContainText(`visudo: ${OPERATORS} unchanged`);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveCount(1);
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
  await expect(page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' })).toBeDisabled();
  await expect(repairPanel(page).getByRole('button', { name: 'この対策を使う' })).toHaveCount(0);

  await loginAs(page, 'admin');
  await type(page, `sudo visudo -f ${OPERATORS}`);
  const line = editor(page).getByRole('textbox', { name: '3 行目', exact: true });
  await expect(line).toHaveValue(new RegExp(`NOPASSWD: ${maintenance}$`));
  await line.fill(`# ${await line.inputValue()}`);
  await editor(page).getByRole('button', { name: /^保存して閉じる/ }).click();
  await expect(terminalOutput(page)).toContainText(`visudo: ${OPERATORS} の 3 行目を保存しました`);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([new RegExp(`^admin → \\$ sudo visudo -f ${OPERATORS}（3 行目を「# [a-z]+ ALL=\\(root\\) NOPASSWD: ${maintenance}」に書き換えて保存）$`)]);
  await expect(repairPanel(page)).toContainText('加えた変更：1 件');
  await expect(page.locator('.state-stamp')).toHaveText('対策中');

  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');

  // 演習中の機械でも、同じ操作が拒否されるようになっている
  await loginAs(page, 'operator');
  await type(page, `sudo ${maintenance}`);
  await expect(terminalOutput(page).locator('.term-err')).toContainText('is not allowed to execute');
});

test('絞りすぎるとふだんの使い方の失敗で合格せず、最初の状態に戻すと加えた変更が消える', async ({ page }) => {
  await loginAs(page, 'admin');
  // 2 行を 1 回の保存で書き換えると、加えた変更は 1 件になる
  await commentOut(page, 2, 3);
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page).locator('.repair-log li')).toHaveCount(1);

  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
  await expect(verifyResults(page)).toContainText('まだ合格ではありません ふだんの使い方が壊れています。', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：未達成');
  // 選び直す対策はないので、選び直しのボタンは出ない
  await expect(page.getByRole('button', { name: /対策を選び直す/ })).toHaveCount(0);

  await resetToInitial(page);
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
});
