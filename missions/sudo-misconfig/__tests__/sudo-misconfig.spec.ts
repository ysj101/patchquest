// ミッション「広すぎる sudo の許可を絞る」（Issue #153）。カタログに登録しただけで一覧に出て、ターミナルで過剰な許可を見つけて
// 再現し、絞りすぎると正常系の失敗で不合格（A05）、保守の操作の許可だけを外すと合格する（A04）。調べるのも直すのも、
// ターミナルにコマンドを打って行う（visudo の編集画面で行をコメントにする）
import type { Page } from '@playwright/test';
import { answerTransferCheck, commentOutWithVisudo, expect, loginToTerminal, openHome, resetToInitial, startMission, terminalInput, terminalOutput, test, ticketSeals as seals, typeCommand, verifyResults as results } from '../../../tests/e2e/fixtures';

const CORRECT_CHOICES: Record<string, string> = {
  'backup-cause': 'バックアップに必要な分をこえて、すべてのコマンドが許可されている',
  'deploy-defense': '利用者アカウントの管理の許可だけを外し、サービスの再起動の許可は残す',
  'shared-folder-defense': 'フォルダを見て編集できる人を、経理の 3 人だけにする',
};

const repairPanel = (page: Page) => page.getByRole('tabpanel', { name: '対策' });

/** 管理者の端末で、運用担当向けの設定の行を visudo でコメントにして保存する */
const disableLines = (page: Page, ...lines: number[]) => commentOutWithVisudo(page, '/etc/sudoers.d/operators', lines);

async function verify(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
}

test('ターミナルで過剰な許可を見つけて再現し、絞りすぎでは不合格、保守の操作の許可だけを外すと合格する', async ({ page }) => {
  test.setTimeout(120_000);
  await openHome(page);
  const card = page.locator('[data-mission="sudo-misconfig"]');
  await expect(card.getByRole('heading', { name: '広すぎる sudo の許可を絞る' })).toBeVisible();
  await expect(card).toContainText('過剰な sudo 権限');
  await startMission(page, 'sudo-misconfig');
  await expect(terminalInput(page)).toBeVisible();

  // 調べる：運用メモでは管理者だけの操作が、運用担当の許可の一覧に入っている
  await typeCommand(page, 'cat runbook.txt');
  await expect(terminalOutput(page)).toContainText('は管理者だけが行う');
  await typeCommand(page, 'sudo -l');
  await expect(terminalOutput(page)).toContainText('NOPASSWD: /usr/local/sbin/');
  const maintenance = (await terminalOutput(page).innerText()).match(/NOPASSWD: (\/usr\/local\/sbin\/[a-z-]+)/)?.[1];
  if (!maintenance) throw new Error('保守の操作が許可の一覧に出ていません');

  // 再現：運用担当が保守の操作を root の権限で実行できる
  await typeCommand(page, `sudo ${maintenance}`);
  await expect(seals(page)).toContainText('再現：達成');
  await expect(page.locator('.result-callout')).toContainText('運用担当なのに、保守の操作までできてしまうんですね。');

  // A05：日常の運用操作の許可（2 行目）まで外すと、ふだんの使い方が壊れて合格しない
  await loginToTerminal(page, 'admin');
  await disableLines(page, 2);
  await disableLines(page, 3);
  await verify(page);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveCount(2);
  await expect(results(page)).toContainText('まだ合格ではありません ふだんの使い方が壊れています。', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：未達成');

  // やり直す：加えた変更が消え、機械も過剰な許可のある状態へ戻る
  await resetToInitial(page);
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');

  // A04：保守の操作の許可（3 行目）だけを外すと、記録した操作が再生されて合格する
  await disableLines(page, 3);
  await verify(page);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([new RegExp(`^admin → \\$ sudo visudo -f /etc/sudoers.d/operators（3 行目を「# [a-z]+ ALL=\\(root\\) NOPASSWD: ${maintenance}」に書き換えて保存）$`)]);
  await expect(results(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');

  // 演習中の機械でも、運用担当の保守の操作は拒否され、許可の一覧からも消えている
  await loginToTerminal(page, 'operator');
  await typeCommand(page, `sudo ${maintenance}`);
  await expect(terminalOutput(page).locator('.term-err')).toContainText('is not allowed to execute');
  await typeCommand(page, 'sudo -l');
  await expect(terminalOutput(page).locator('.term-out')).not.toContainText(maintenance);

  await answerTransferCheck(page, CORRECT_CHOICES);
  await expect(page.locator('.state-stamp')).toHaveText('解決');
});

test('調査タブの先頭に、sudo の仕組みと最初に打つコマンドを示す調べ方が出て、直し方はヒントとして対策タブからも開ける', async ({ page }) => {
  await startMission(page, 'sudo-misconfig');
  await page.getByRole('tab', { name: '調査' }).click();
  const approach = page.getByRole('region', { name: '調べ方' });
  await expect(approach).toContainText('sudo は、許可された利用者が、コマンドを管理者（root）の権限で動かすための仕組みです');
  await expect(approach.locator('.approach-steps li')).toHaveCount(4);
  for (const command of ['help', 'cat runbook.txt', 'sudo -l']) await expect(approach).toContainText(command);
  await expect(approach).not.toContainText('visudo');

  // 調べ方を読んでもヒントの利用には数えず、ヒントは調査タブからも開ける
  const hints = page.getByRole('tabpanel', { name: '調査' }).getByRole('region', { name: 'ヒント' });
  await expect(hints.locator('.hint')).toHaveCount(0);
  await hints.getByRole('button', { name: 'ヒント 1（見るところ）を見る' }).click();
  await expect(hints.locator('.hint')).toContainText('sudo -l の一覧に入っていないでしょうか');

  // 直し方のヒント（直し方）は対策タブからも開ける
  const repairHints = page.getByRole('tabpanel', { name: '対策' }).getByRole('region', { name: 'ヒント' });
  await page.getByRole('tab', { name: '対策' }).click();
  await repairHints.getByRole('button', { name: 'ヒント 2（調べ方）を見る' }).click();
  await repairHints.getByRole('button', { name: 'ヒント 3（直し方）を見る' }).click();
  await expect(repairHints.locator('.hint').last()).toContainText('sudo visudo -f /etc/sudoers.d/operators');

  // 調べ方のとおりに打つと、比べる 2 つが端末に出る
  await typeCommand(page, 'cat runbook.txt');
  await expect(terminalOutput(page)).toContainText('は管理者だけが行う');
  await typeCommand(page, 'sudo -l');
  await expect(terminalOutput(page)).toContainText('(root) NOPASSWD: /usr/local/sbin/');
});
