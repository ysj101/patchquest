// 擬似シェル（ターミナル）と、操作で直す課題の学習UI。端末で調べて再現し、visudo で設定を書き換えた操作が記録され、検証の前に再生されることを確かめる
import type { Page } from '@playwright/test';
import { commentOutWithVisudo, currentStage, expect, loginToTerminal as loginAs, preview, resetToInitial, startMission, terminalEditor as editor, terminalInput as commandInput, terminalOutput, test, ticketSeals as seals, typeCommand as type, verifyResults } from './fixtures';

const OPERATORS = '/etc/sudoers.d/operators';
const repairPanel = (page: Page) => page.getByRole('tabpanel', { name: '対策' });

/** 管理者として、運用担当向けの設定の行を visudo でコメントに書き換えて保存する */
const commentOut = (page: Page, ...lines: number[]) => commentOutWithVisudo(page, OPERATORS, lines);

test.beforeEach(async ({ page }) => {
  await startMission(page, 'shell-test-pack');
  await expect(commandInput(page)).toBeVisible();
});

test('端末でコマンドを実行でき、未実装のコマンドや対応していない書き方は理由を示して断る', async ({ page }) => {
  // 最初の案内は、使えるコマンドを調べる help を勧める
  await expect(terminalOutput(page).locator('.term-note')).toHaveText('help と入力すると、使えるコマンドを表示します。↑↓ キーで前に入力したコマンドを呼び出せます。Tab キーでコマンド名とファイル名を補完できます。');
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

test('端末はプレビューの枠の高さいっぱいに広がり、編集画面を開いても下にすき間を残さない', async ({ page }) => {
  /** 端末の下の端から、枠の下の端までのすき間（px）。body の余白（16px）だけが残る */
  const gapBelow = () =>
    preview(page)
      .locator('.terminal')
      .evaluate((terminal) => window.innerHeight - terminal.getBoundingClientRect().bottom);
  expect(await gapBelow()).toBeCloseTo(16, 0);
  // 出力が増えても端末は伸びず、出力の欄の中で送られて、入力欄は見えたまま
  for (let count = 0; count < 12; count += 1) await type(page, 'help');
  expect(await gapBelow()).toBeCloseTo(16, 0);
  await expect(commandInput(page)).toBeInViewport();

  await loginAs(page, 'admin');
  await type(page, `sudo visudo -f ${OPERATORS}`);
  await expect(editor(page)).toBeVisible();
  // 行が多くて枠に収まらないときは下へ伸びる（枠ごと縦に送れる）。枠より短くはならない
  expect(await gapBelow()).toBeLessThanOrEqual(16.5);
});

test('Tab キーでコマンド名とファイル名を補完でき、候補が複数あれば並べて見せる。何も打っていなければ Tab は次の項目へ移る', async ({ page }) => {
  const input = commandInput(page);
  // 候補が 1 つなら、名前と空白まで補う。sudo の直後もコマンド名として補う
  await input.focus();
  await page.keyboard.type('sudo vis');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('sudo visudo ');
  await expect(input).toBeFocused();
  // 引数の位置では、ファイル名を補う。ディレクトリは / まで補い、続けて中の名前を補える（フォーカスは動かさない）
  await page.keyboard.type('-f /etc/sudoers.');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('sudo visudo -f /etc/sudoers.d/');
  await page.keyboard.type('ope');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('sudo visudo -f /etc/sudoers.d/operators ');
  await expect(input).toBeFocused();
  // いまの場所にあるファイルは、名前の先頭だけで補う。候補のない語と、オプションは変えない
  await input.fill('cat ru');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('cat runbook.txt ');
  await input.fill('cat none');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('cat none');
  await input.fill('ls -l');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('ls -l');
  await expect(input).toBeFocused();
  // 候補が複数あるファイル名は、端末に並べる
  await input.fill('cat /etc/sudoers');
  await page.keyboard.press('Tab');
  await expect(terminalOutput(page).locator('.term-out').last()).toHaveText('sudoers  sudoers.d/');

  // 候補が複数あって補えないときは、候補を端末に並べ、入力は残す。補完は、観測ログに何も並べない（端末を開いた 1 件だけ）
  await input.fill('c');
  await page.keyboard.press('Tab');
  await expect(terminalOutput(page).locator('.term-out').last()).toHaveText('cat  cd');
  await expect(input).toHaveValue('c');
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('cat ');
  await expect(page.locator('.log-section .log-entry')).toHaveCount(1);

  // 何も打っていないときの Tab は、補完に使わず、フォーカスを端末の外へ出せる
  await input.fill('');
  await page.keyboard.press('Tab');
  await expect(input).not.toBeFocused();
});

test('観測ログと調査タブは、HTTP のリクエストではなく端末の言葉で示す', async ({ page }) => {
  // 定型の操作がないので、調査タブを開くのではなく、教材アプリで調べるよう案内する
  await currentStage(page).hover();
  await expect(currentStage(page).getByRole('note')).toHaveText('今やること：教材アプリを操作して、手がかりを集めます。');
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
  await expect(investigation.getByRole('heading', { name: '操作', exact: true })).toBeHidden();
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

  // 直して Ctrl+S で保存すると閉じ、加えた変更に 1 件だけ残る。保存を送っている間の Ctrl+S と Esc は受け付けない
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('# 外した');
  await editor(page).evaluate((element) => {
    const press = (key: string, ctrlKey: boolean) => element.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }));
    press('s', true);
    press('s', true);
    press('Escape', false);
  });
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

test('visudo の編集画面で、行を足す・消すことができ、開いたときの行番号での編集として保存される', async ({ page }) => {
  await loginAs(page, 'admin');
  await type(page, `sudo cat ${OPERATORS}`);
  const before = (await terminalOutput(page).locator('.term-out').last().innerText()).split('\n');
  expect(before).toHaveLength(3);

  await type(page, `sudo visudo -f ${OPERATORS}`);
  const rows = editor(page).getByRole('textbox');
  await expect(editor(page)).toContainText('行の右の ＋（または Enter）で下に行を足し、×（または空にした行で Backspace）でその行を消します。');

  // キーボード：1 行目で Enter を押すと下に空の行ができ、フォーカスが移る。行番号は画面の並びに合わせて付け直す
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(4);
  await expect(editor(page).getByRole('textbox', { name: '2 行目', exact: true })).toBeFocused();
  await page.keyboard.type('# 足した行');
  // 空の行で Backspace を押すと、その行が消えて前の行へ戻る
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(5);
  await page.keyboard.press('Backspace');
  await expect(rows).toHaveCount(4);
  await expect(editor(page).getByRole('textbox', { name: '2 行目', exact: true })).toBeFocused();
  // Tab は、行ごとのボタンを挟まずに次の行へ移る
  await page.keyboard.press('Tab');
  await expect(editor(page).getByRole('textbox', { name: '3 行目', exact: true })).toBeFocused();

  // マウス：最後の行（開いたときの 3 行目）を × で消し、先頭に行を足す
  await editor(page).getByRole('button', { name: '4 行目を消す', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await editor(page).getByRole('button', { name: '＋ 先頭に行を足す', exact: true }).click();
  await expect(editor(page).getByRole('textbox', { name: '1 行目', exact: true })).toBeFocused();
  await page.keyboard.type('# 見出し');
  await expect(rows).toHaveCount(4);

  await page.keyboard.press('Control+s');
  await expect(editor(page)).toHaveCount(0);
  await expect(terminalOutput(page)).toContainText(`visudo: ${OPERATORS} を保存しました（3 行目を削除、2 行を追加）`);
  await type(page, `sudo cat ${OPERATORS}`);
  await expect(terminalOutput(page).locator('.term-out').last()).toHaveText(['# 見出し', before[0], '# 足した行', before[1]].join('\n'));

  // 加えた変更と観測ログは、開いたときの行番号で示す
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repairPanel(page).locator('.repair-log li')).toHaveText([`admin → $ sudo visudo -f ${OPERATORS}（3 行目を削除、先頭に「# 見出し」を追加、1 行目の下に「# 足した行」を追加して保存）`]);
  const saved = page.locator('.log-section .log-entry').filter({ hasText: '追加して保存' });
  await saved.locator('summary').click();
  await expect(saved).toContainText('エディタで変えた行');
  await expect(saved).toContainText('3 行目：（削除）');
  await expect(saved).toContainText(`ファイルの変更：${OPERATORS} の 3 行目（削除）・先頭・1 行目の下（追加）`);
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

test('利用者を切り替えて戻ると、その利用者の端末の出力・入力の履歴・作業ディレクトリが残っていて、最初の状態に戻すと消える', async ({ page }) => {
  await type(page, 'cd /etc');
  await type(page, 'cat hostname');
  await expect(terminalOutput(page).locator('.term-out')).toHaveCount(1);
  const before = await terminalOutput(page).locator('pre').allInnerTexts();

  // 別の利用者の端末は、その利用者のもの。運用担当の出力は混ざらない
  await loginAs(page, 'admin');
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
  await type(page, 'whoami');
  await expect(terminalOutput(page).locator('.term-out')).toHaveText(/^[a-z]+$/);
  const adminLines = await terminalOutput(page).locator('pre').allInnerTexts();

  await loginAs(page, 'operator');
  await expect(terminalOutput(page).locator('pre')).toHaveText(before);
  await expect(preview(page).locator('.term-prompt')).toHaveText(/:\/etc\$$/);
  // 戻ったあともコマンドを送れ、前に入力したコマンドを ↑ で呼び出せる
  await type(page, 'pwd');
  await expect(terminalOutput(page).locator('.term-out').last()).toHaveText('/etc');
  await commandInput(page).press('ArrowUp');
  await commandInput(page).press('ArrowUp');
  await expect(commandInput(page)).toHaveValue('cat hostname');
  await commandInput(page).fill('');

  await loginAs(page, 'admin');
  await expect(terminalOutput(page).locator('pre')).toHaveText(adminLines);

  // 最初の状態に戻すと、機械も戻るので、どの利用者の端末も開いたばかりの状態になる
  await page.getByRole('tab', { name: '対策' }).click();
  await resetToInitial(page);
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
  await loginAs(page, 'operator');
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
  await expect(preview(page).locator('.term-prompt')).not.toHaveText(/:\/etc\$$/);
});

test('端末の出力やプロンプトを押しても打ち始められ、日本語入力の変換を確定する Enter では送らない', async ({ page }) => {
  // 入力欄を正確に押さなくても、端末のどこかを押せば入力欄へフォーカスが移る
  await page.locator('#exercise-title').focus();
  await terminalOutput(page).click({ position: { x: 30, y: 10 } });
  await expect(commandInput(page)).toBeFocused();
  await page.locator('#exercise-title').focus();
  await preview(page).locator('.term-prompt').click();
  await page.keyboard.type('whoami');
  await expect(commandInput(page)).toHaveValue('whoami');

  // 変換中の Enter（isComposing）は確定の操作なので、コマンドとして送らない
  await commandInput(page).dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(commandInput(page)).toHaveValue('whoami');
  await expect(terminalOutput(page).locator('.term-line')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(terminalOutput(page).locator('.term-out')).toHaveText(/^[a-z]+$/);
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
  await expect(page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' })).toBeEnabled();

  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 20_000 });
  await expect(seals(page)).toContainText('防御：達成');
  // テストの結果の詳細も、HTTP の形（POST /sh・status 200）ではなく、コマンド行と終了コードで示す
  await verifyResults(page).getByText('詳しく見る').click();
  const denied = verifyResults(page).locator('.outcome', { hasText: '運用担当は、保守の操作を sudo で実行できない' });
  await expect(denied.locator('dd')).toHaveText([`operator が $ sudo ${maintenance} → 終了コード 0 以外`, '終了コード 1']);
  await expect(verifyResults(page).locator('.verify-details')).not.toContainText(/POST \/sh|status \d/);

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
  // 不合格の実測は、終了コードのあとに期待との差を続ける
  await verifyResults(page).getByText('詳しく見る').click();
  const broken = verifyResults(page).locator('.outcome', { hasText: '運用担当は、日常の運用操作を sudo で実行できる' });
  await expect(broken.locator('dd').first()).toHaveText(/^operator が \$ sudo \S+ → 終了コード 0$/);
  await expect(broken.locator('dd').last()).toHaveText(/^終了コード 1：exit が ＝ 0 ではない（実際は 1）/);
  // 選び直す対策はないので、選び直しのボタンは出ない
  await expect(page.getByRole('button', { name: /対策を選び直す/ })).toHaveCount(0);

  await resetToInitial(page);
  await expect(repairPanel(page)).toContainText('加えた変更はまだありません');
  await expect(terminalOutput(page).locator('pre')).toHaveCount(1);
});
