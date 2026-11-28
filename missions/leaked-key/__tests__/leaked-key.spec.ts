// ミッション「消した鍵を、使えなくする」。カタログに登録しただけで一覧に出て、ターミナルで git の履歴から消したはずの鍵を取り出して再現する。
// 取り出した鍵の指紋が、ログインを許す鍵の一覧にあることを確かめる。新しい鍵を足すだけでは不合格、登録を空にすると正常系の失敗で不合格（A05）、
// 鍵を作り直して登録を入れ替えると合格する（A04）
import type { Page } from '@playwright/test';
import { MACHINE, answerTransferCheck, beginMachineMission, enterWorkbench, expect, expectBrokenNormalThenReset, expectDefended, expectStillVulnerableThenReset, guideCodes, loginToTerminal, openHome, repairPanel, terminalInput, terminalOutput, test, testRepair, ticketSeals as seals, typeCommand } from '../../../tests/e2e/fixtures';

const CORRECT_CHOICES: Record<string, string> = {
  'api-key-deleted-cause': '前のコミットに API キーが残っていて、リポジトリを見られる人はだれでも取り出して使える',
  'shared-secret-defense': 'データベースのパスワードを新しいものに変えて、古いパスワードを使えなくする',
};

const KEYS = '/home/deploy/.ssh/authorized_keys';
/** 履歴に残っている鍵の指紋（apps/shell/linux/repo.ts の LEAKED_FINGERPRINT） */
const LEAKED = 'SHA256:VNwNUi+BdhDixSy6jomQ6NHFOQbbSV1OGWdGxzeL+ZY';
const NEW_KEY = "ssh-keygen -t ed25519 -N '' -f ~/new_deploy_key";

/** 対策タブの「あなたが加えた変更」に並んだ操作 */
const changes = (page: Page) => repairPanel(page).locator('.repair-log li');
/** 端末の出力のうち、最後のコマンドの標準出力 */
const lastOutput = (page: Page) => terminalOutput(page).locator('.term-out').last();

test('履歴から消したはずの鍵を取り出して再現し、新しい鍵を足すだけ・登録を空にするだけでは不合格、登録を入れ替えると合格する', MACHINE, async ({ page }) => {
  // 本物の Linux を起動し、検証のたびに機械の中でコマンドを実行するので、時間がかかる
  test.setTimeout(300_000);
  await openHome(page);
  const card = page.locator('[data-mission="leaked-key"]');
  await expect(card.getByRole('heading', { name: '消した鍵を、使えなくする' })).toBeVisible();
  await expect(card).toContainText('履歴に残った鍵');
  await beginMachineMission(page, 'leaked-key');
  await enterWorkbench(page);
  await expect(terminalInput(page)).toBeVisible();

  // 調べ方は、履歴から鍵を取り出して指紋を見くらべる操作を示し、直し方は書かない
  await page.getByRole('tab', { name: '調査' }).click();
  const approachCodes = await guideCodes(page, '調べ方');
  for (const code of ['cat runbook.txt', 'git log --oneline', 'git show コミットの番号', 'chmod 600 /tmp/leaked_key', 'ssh-keygen -lf /tmp/leaked_key', `ssh-keygen -lf ${KEYS}`]) expect(approachCodes).toContain(code);
  await expect(page.getByRole('region', { name: '調べ方' })).not.toContainText('sudo tee');

  // 調べる：運用メモに、リポジトリの場所と、ログインを許す鍵の登録先がある。いまのファイルに鍵はない
  await typeCommand(page, 'cat runbook.txt');
  await expect(lastOutput(page)).toContainText(`${KEYS} に登録してある`);
  await typeCommand(page, 'cd app');
  await typeCommand(page, 'ls -a');
  await expect(lastOutput(page)).toContainText('deploy.sh');
  await expect(lastOutput(page)).not.toContainText('deploy_key');
  await typeCommand(page, 'git log --oneline');
  await expect(lastOutput(page)).toContainText('鍵をリポジトリから消す');
  const commits = (await lastOutput(page).innerText()).split('\n').map((line) => line.split(' ')[0] ?? '');
  const [removed = '', added = ''] = commits;
  expect(commits).toHaveLength(3);

  // 再現：鍵を消したコミットを開くと、消したはずの秘密の鍵が、そのまま出てくる
  await typeCommand(page, `git show ${removed}`);
  await expect(lastOutput(page)).toContainText('------BEGIN OPENSSH PRIVATE KEY-----');
  await expect(seals(page)).toContainText('再現：達成');
  await expect(page.locator('.result-callout')).toContainText('セキュリティホールを再現できました');

  // 鍵を足したコミットからファイルを取り出すと、その指紋は、ログインを許されている鍵の指紋と同じ
  await typeCommand(page, `git show ${added}:deploy_key > /tmp/leaked_key`);
  await typeCommand(page, 'chmod 600 /tmp/leaked_key');
  await typeCommand(page, 'ssh-keygen -lf /tmp/leaked_key');
  await expect(lastOutput(page)).toContainText(LEAKED);
  await typeCommand(page, `ssh-keygen -lf ${KEYS}`);
  await expect(lastOutput(page)).toContainText(LEAKED);

  // 調べただけ（/tmp に取り出しただけ）では、「加えた変更」に並ばない
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  const repairCodes = await guideCodes(page, '操作のしかた');
  for (const code of ["ssh-keygen -t ed25519 -N '' -f ~/鍵のファイル名", 'cat ファイル | sudo tee 書き先のファイル', 'cat ファイル | sudo tee -a 書き先のファイル', `ssh-keygen -lf ${KEYS}`]) expect(repairCodes).toContain(code);

  // 運用担当は、ログインを許す鍵の一覧を書き換えられない
  await typeCommand(page, `echo x | sudo tee ${KEYS}`);
  await expect(terminalOutput(page).locator('.term-err').last()).toContainText('is not allowed to execute');

  // 新しい鍵を足すだけでは、古い鍵の登録が残るので合格しない
  await loginToTerminal(page, 'admin');
  await typeCommand(page, NEW_KEY);
  await expect(lastOutput(page)).toContainText('Your public key has been saved in');
  await typeCommand(page, `cat ~/new_deploy_key.pub | sudo tee -a ${KEYS}`);
  // コマンドが終わって「加えた変更」に並んでから、テストする（並ぶ前に押すと、その操作を含まずにテストが走る）
  await expect(changes(page)).toHaveCount(2);
  await testRepair(page);
  await expectStillVulnerableThenReset(page, '履歴に残っている鍵は、デプロイ用の利用者に登録されていない');

  // A05：登録を空にすると、履歴の鍵は使えなくなるが、だれもデプロイできなくなって合格しない
  await typeCommand(page, `sudo sh -c ': > ${KEYS}'`);
  await expect(changes(page)).toHaveCount(1);
  await testRepair(page);
  await expectBrokenNormalThenReset(page);

  // A04：鍵を作り直し、登録を新しい公開鍵に入れ替えると、記録した操作が再生されて合格する
  await typeCommand(page, NEW_KEY);
  await typeCommand(page, `cat ~/new_deploy_key.pub | sudo tee ${KEYS}`);
  await expect(changes(page)).toHaveText([`admin → $ ${NEW_KEY}`, `admin → $ cat ~/new_deploy_key.pub | sudo tee ${KEYS}`]);
  await testRepair(page);
  await expectDefended(page);

  // 演習中の機械でも、登録されている鍵の指紋は、履歴に残っている鍵のものではなくなっている
  await loginToTerminal(page, 'operator');
  await typeCommand(page, `ssh-keygen -lf ${KEYS}`);
  await expect(lastOutput(page)).toContainText('SHA256:');
  await expect(lastOutput(page)).not.toContainText(LEAKED);

  await answerTransferCheck(page, CORRECT_CHOICES);
  await expect(page.getByRole('list', { name: 'ステージ', exact: true }).locator('li[data-state="done"]')).toHaveCount(5);
});
