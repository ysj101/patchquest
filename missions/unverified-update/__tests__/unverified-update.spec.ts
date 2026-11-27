// ミッション「更新を、確かめてから取り込む」。カタログに登録しただけで一覧に出て、ターミナルでハッシュを計算して見くらべ、
// 更新を書き換えると値が変わること、書き換えた更新が root の権限で動くことを再現する。確かめるだけでやめない直し方は不合格、
// 取り込みそのものを止めると正常系の失敗で不合格（A05）、動かす前に sha256sum -c で確かめてやめる行を入れると合格する（A04）
import type { Page } from '@playwright/test';
import { MACHINE, answerTransferCheck, beginMachineMission, commentOutWithVisudo, enterWorkbench, expect, expectBrokenNormalThenReset, expectDefended, loginToTerminal, openHome, repairPanel, resetToInitial, rewriteWithSudoedit, terminalEditor, terminalInput, terminalOutput, test, testRepair, ticketSeals as seals, typeCommand, verifyResults } from '../../../tests/e2e/fixtures';

const CORRECT_CHOICES: Record<string, string> = {
  'install-script-cause': '途中で書き換えられたスクリプトでも、気づかないまま root の権限で動かしてしまう',
  'same-place-defense': 'ハッシュの一覧を、ファイルとは別の、書き換えられにくい経路で受け取る（配布元の署名が付いた一覧を使うなど）',
};

const APPLY = '/usr/local/bin/apply-update';
const CHECK = 'sha256sum -c /etc/updates/SHA256SUMS';
/** 配布元が出したままの更新のハッシュ（apps/shell/linux/update.ts の UPDATE_SHA256） */
const GENUINE = 'c067468ede5b05941adf62383a594ca3c636e640caaf01dec3281f30ab2ee1ec';

/** 端末の出力のうち、最後のコマンドの標準出力 */
const lastOutput = (page: Page) => terminalOutput(page).locator('.term-out').last();

/** 運用メモから保守の操作のパスを読み、受け取った更新の末尾に足す */
async function appendMaintenance(page: Page): Promise<string> {
  await typeCommand(page, 'cat ~/runbook.txt');
  await expect(terminalOutput(page)).toContainText('は管理者だけが行う');
  const maintenance = /保守の操作（(\/usr\/local\/sbin\/[a-z-]+)）/.exec(await terminalOutput(page).innerText())?.[1];
  if (!maintenance) throw new Error('運用メモに保守の操作が出ていません');
  await typeCommand(page, `echo ${maintenance} >> /var/cache/updates/update.sh`);
  return maintenance;
}

test('ハッシュを計算して見くらべ、書き換えた更新を再現し、確かめるだけ・取り込みを止めるだけでは不合格、確かめてやめる行を入れると合格する', MACHINE, async ({ page }) => {
  // 本物の Linux を起動し、検証のたびに機械の中でコマンドを実行するので、時間がかかる
  test.setTimeout(300_000);
  await openHome(page);
  const card = page.locator('[data-mission="unverified-update"]');
  await expect(card.getByRole('heading', { name: '更新を、確かめてから取り込む' })).toBeVisible();
  await expect(card).toContainText('確かめない更新');
  // 準備の間は、ほかの課題より長く待つことを先に伝える
  await beginMachineMission(page, 'unverified-update');
  await enterWorkbench(page);
  await expect(terminalInput(page)).toBeVisible();

  // 調べ方は、ハッシュを自分で計算して見くらべる操作を示し、直し方は書かない
  await page.getByRole('tab', { name: '調査' }).click();
  const approach = page.getByRole('region', { name: '調べ方' });
  await expect(approach.locator('code')).toContainText(['cat runbook.txt', 'cd /var/cache/updates', 'sha256sum update.sh', 'cat /etc/updates/SHA256SUMS', CHECK, 'update.sh: OK', `cat ${APPLY}`, 'echo 足す行 >> update.sh']);
  await expect(approach).not.toContainText('sudoedit');

  // 調べる：運用メモに、置き場・取り込みのコマンド・ハッシュの一覧の場所がある
  await typeCommand(page, 'cat runbook.txt');
  await expect(lastOutput(page)).toContainText('/etc/updates/SHA256SUMS に写してある');
  // 自分で計算したハッシュは、配布元が知らせた値と同じ。sha256sum -c も OK を出す
  await typeCommand(page, 'cd /var/cache/updates');
  await typeCommand(page, 'sha256sum update.sh');
  await expect(lastOutput(page)).toHaveText(`${GENUINE}  update.sh`);
  await typeCommand(page, 'cat /etc/updates/SHA256SUMS');
  await expect(lastOutput(page)).toHaveText(`${GENUINE}  update.sh`);
  await typeCommand(page, CHECK);
  await expect(lastOutput(page)).toHaveText('update.sh: OK');
  // 取り込みのプログラムは、確かめる行が外されたまま、更新を動かしている
  await typeCommand(page, `cat ${APPLY}`);
  await expect(lastOutput(page)).toContainText('中身を確かめる行を一時的に外した');
  await expect(lastOutput(page)).not.toContainText('sha256sum');

  // 再現：更新に 1 行足すと、ハッシュが別の値になり、sha256sum -c は FAILED を出す。それでも取り込みは、足した行を root の権限で動かす
  const maintenance = await appendMaintenance(page);
  await typeCommand(page, 'sha256sum update.sh');
  await expect(lastOutput(page)).toHaveText(/^[0-9a-f]{64} {2}update\.sh$/);
  await expect(lastOutput(page)).not.toContainText(GENUINE);
  await typeCommand(page, CHECK);
  await expect(lastOutput(page)).toHaveText('update.sh: FAILED');
  await typeCommand(page, 'sudo apply-update');
  await expect(seals(page)).toContainText('再現：達成');
  await expect(page.locator('.result-callout')).toContainText('セキュリティホールを再現できました');

  // 更新を書き換えた操作は、機械の設定の変更ではないので「加えた変更」に並ばない
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  // 操作のしかたは、編集する道具の使い方を、名指ししているボタンと同じ名前で案内する
  await expect(page.getByRole('region', { name: '操作のしかた' }).locator('code')).toContainText(['sudoedit', 'ls -l ファイルのパス', 'sudoedit ファイルのパス', "sed -i '$d' /var/cache/updates/update.sh"]);
  await expect(page.getByRole('region', { name: '操作のしかた' })).toContainText('「最初の状態に戻す」');

  // A05：運用担当の sudo の許可（2 行目）を外して取り込みそのものを止めると、ふだんの使い方が壊れて合格しない
  await loginToTerminal(page, 'admin');
  await commentOutWithVisudo(page, '/etc/sudoers.d/operators', [2]);
  await testRepair(page);
  // やり直す：加えた変更が消え、機械も確かめる行が外された状態へ戻る
  await expectBrokenNormalThenReset(page);

  // 確かめるだけで、合わなくてもやめない行では、書き換えた更新が動いてしまうので合格しない
  await rewriteWithSudoedit(page, APPLY, 6, CHECK);
  await testRepair(page);
  await expect(verifyResults(page)).toContainText('まだ合格ではありません', { timeout: 90_000 });
  await expect(verifyResults(page)).toContainText('中身を書き換えられた更新は、取り込まない');
  await expect(seals(page)).toContainText('防御：未達成');
  await resetToInitial(page);
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');

  // 運用担当は、取り込みのプログラムを開けない
  await loginToTerminal(page, 'operator');
  await typeCommand(page, `sudoedit ${APPLY}`);
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('is not allowed to execute');
  await expect(terminalEditor(page)).toHaveCount(0);

  // A04：管理者が sudoedit で取り込みのプログラムを開き、確かめてやめる行を入れると、記録した操作が再生されて合格する
  await loginToTerminal(page, 'admin');
  await typeCommand(page, `sudoedit ${APPLY}`);
  await expect(terminalEditor(page)).toContainText(`sudoedit: ${APPLY} を編集しています。`);
  await expect(terminalEditor(page).getByRole('textbox', { name: '6 行目', exact: true })).toHaveValue(/中身を確かめる行を一時的に外した/);
  await expect(terminalEditor(page).getByRole('textbox', { name: '7 行目', exact: true })).toHaveValue('sh ./update.sh');
  await terminalEditor(page).getByRole('button', { name: /^保存せずに閉じる/ }).click();
  await rewriteWithSudoedit(page, APPLY, 6, `${CHECK} || exit 1`);
  await testRepair(page);
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([`admin → $ sudoedit ${APPLY}（6 行目を「${CHECK} || exit 1」に書き換えて保存）`]);
  await expectDefended(page);

  // 演習中の機械でも、正しい更新は取り込め、書き換えた更新は、動かす前に止まる
  await loginToTerminal(page, 'operator');
  await typeCommand(page, 'sudo apply-update');
  await expect(lastOutput(page)).toContainText('update.sh: OK');
  await expect(lastOutput(page)).toContainText('更新 2026.10 を取り込みました');
  await appendMaintenance(page);
  await typeCommand(page, 'sudo apply-update');
  await expect(lastOutput(page)).toHaveText('update.sh: FAILED');
  await expect(terminalOutput(page)).not.toContainText(`${maintenance}: `);
  // 操作のしかたにあるコマンドで足した行を消すと、配布元が出したままに戻り、また取り込める
  await typeCommand(page, "sed -i '$d' /var/cache/updates/update.sh");
  await typeCommand(page, 'sudo apply-update');
  await expect(lastOutput(page)).toContainText('update.sh: OK');
  await expect(lastOutput(page)).toContainText('更新 2026.10 を取り込みました');

  await answerTransferCheck(page, CORRECT_CHOICES);
  await expect(page.getByRole('list', { name: 'ステージ', exact: true }).locator('li[data-state="done"]')).toHaveCount(5);
});
