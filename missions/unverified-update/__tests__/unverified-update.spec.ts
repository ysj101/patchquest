// ミッション「更新を、確かめてから取り込む」。カタログに登録しただけで一覧に出て、ターミナルで取り込みの仕組みを調べ、
// 書き換えた更新が root の権限で動くことを再現する。取り込みそのものを止めると正常系の失敗で不合格（A05）、
// 中身の確認を有効にすると合格する（A04）。調べるのも直すのも、ターミナルにコマンドを打って行う
import type { Page } from '@playwright/test';
import { MACHINE, answerTransferCheck, commentOutWithVisudo, enterWorkbench, expect, expectBrokenNormalThenReset, expectDefended, loginToTerminal, openHome, repairPanel, rewriteWithSudoedit, terminalEditor, terminalInput, terminalOutput, test, testRepair, ticketSeals as seals, typeCommand } from '../../../tests/e2e/fixtures';

const CORRECT_CHOICES: Record<string, string> = {
  'auto-update-cause': '配るサーバの中身が書き換えられると、全員のパソコンがそれをそのまま動かす',
  'web-parts-defense': '読み込んだ部品の中身が、前もって確かめておいたものと同じかを確かめてから動かす',
};

/** 運用メモから保守の操作のパスを読み、受け取った更新の末尾に足す */
async function appendMaintenance(page: Page): Promise<string> {
  await typeCommand(page, 'cat runbook.txt');
  await expect(terminalOutput(page)).toContainText('は管理者だけが行う');
  const maintenance = /保守の操作（(\/usr\/local\/sbin\/[a-z-]+)）/.exec(await terminalOutput(page).innerText())?.[1];
  if (!maintenance) throw new Error('運用メモに保守の操作が出ていません');
  await typeCommand(page, `echo ${maintenance} >> /var/cache/updates/update.sh`);
  return maintenance;
}

test('ターミナルで取り込みの仕組みを調べて再現し、取り込みを止めると不合格、中身の確認を有効にすると合格する', MACHINE, async ({ page }) => {
  // 本物の Linux を起動し、検証のたびに機械の中でコマンドを実行するので、時間がかかる
  test.setTimeout(240_000);
  await openHome(page);
  const card = page.locator('[data-mission="unverified-update"]');
  await expect(card.getByRole('heading', { name: '更新を、確かめてから取り込む' })).toBeVisible();
  await expect(card).toContainText('確かめない更新');
  await card.getByRole('button', { name: /この課題を始める|最初から始める/ }).click();
  await expect(page.locator('.exercise')).toBeVisible({ timeout: 60_000 });
  await enterWorkbench(page);
  await expect(terminalInput(page)).toBeVisible();

  // 調べ方は、取り込みの仕組みと最初に打つコマンドを示し、直し方は書かない
  await page.getByRole('tab', { name: '調査' }).click();
  const approach = page.getByRole('region', { name: '調べ方' });
  await expect(approach.locator('code')).toHaveText(['cat runbook.txt', 'cat /usr/local/bin/apply-update', 'cat ファイルのパス', 'ls -l /var/cache/updates', '-rw-r--r--']);
  await expect(approach).not.toContainText('sudoedit');

  // 調べる：取り込みのプログラムは中身を確かめられるが、設定で切られている
  await typeCommand(page, 'cat /usr/local/bin/apply-update');
  await expect(terminalOutput(page)).toContainText('sha256sum -c /etc/update.sums');
  await typeCommand(page, 'cat /etc/update.conf');
  await expect(terminalOutput(page)).toContainText('一時的に切った');

  // 再現：運用担当が更新に足した行が、root の権限で動く
  const maintenance = await appendMaintenance(page);
  await typeCommand(page, 'sudo apply-update');
  await expect(terminalOutput(page)).toContainText('中身の確認：しない');
  await expect(seals(page)).toContainText('再現：達成');
  await expect(page.locator('.result-callout')).toContainText('足した行まで、root の権限で動いてしまうんですね。');

  // 更新を書き換えた操作は、機械の設定の変更ではないので「加えた変更」に並ばない
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  // 操作のしかたは、編集する道具の使い方を、名指ししているボタンと同じ名前で案内する
  await expect(page.getByRole('region', { name: '操作のしかた' }).locator('code')).toContainText(['sudoedit', 'sudoedit ファイルのパス']);
  await expect(page.getByRole('region', { name: '操作のしかた' })).toContainText('「最初の状態に戻す」');

  // A05：運用担当の sudo の許可（2 行目）を外して取り込みそのものを止めると、ふだんの使い方が壊れて合格しない
  await loginToTerminal(page, 'admin');
  await commentOutWithVisudo(page, '/etc/sudoers.d/operators', [2]);
  await testRepair(page);
  // やり直す：加えた変更が消え、機械も確認が切られた状態へ戻る
  await expectBrokenNormalThenReset(page);

  // 運用担当は、設定を開けない
  await loginToTerminal(page, 'operator');
  await typeCommand(page, 'sudoedit /etc/update.conf');
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('is not allowed to execute');
  await expect(terminalEditor(page)).toHaveCount(0);

  // A04：管理者が sudoedit で設定を開き、中身の確認を有効にすると、記録した操作が再生されて合格する
  await loginToTerminal(page, 'admin');
  await typeCommand(page, 'sudoedit /etc/update.conf');
  await expect(terminalEditor(page)).toContainText('sudoedit: /etc/update.conf を編集しています。');
  await expect(terminalEditor(page).getByRole('textbox', { name: '5 行目', exact: true })).toHaveValue('verify=off');
  await terminalEditor(page).getByRole('button', { name: /^保存せずに閉じる/ }).click();
  await rewriteWithSudoedit(page, '/etc/update.conf', 5, 'verify=on');
  await testRepair(page);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText(['admin → $ sudoedit /etc/update.conf（5 行目を「verify=on」に書き換えて保存）']);
  await expectDefended(page);

  // 演習中の機械でも、正しい更新は取り込め、書き換えた更新は止まる
  await loginToTerminal(page, 'operator');
  await typeCommand(page, 'sudo apply-update');
  await expect(terminalOutput(page)).toContainText('update.sh: OK');
  await appendMaintenance(page);
  await typeCommand(page, 'sudo apply-update');
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('更新の中身が一覧と合いません。取り込みをやめました');
  await expect(terminalOutput(page)).not.toContainText(`${maintenance}: `);

  await answerTransferCheck(page, CORRECT_CHOICES);
  await expect(page.locator('.state-stamp')).toHaveText('解決');
});
