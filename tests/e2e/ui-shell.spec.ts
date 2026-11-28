// 学習UI：アプリシェル・ミッション一覧・開始前チェック（Issue #11）
import type { Page } from '@playwright/test';
import { backToList, blockIndexedDb, enterAndReproduce, enterWorkbench, expect, launchButton, preflightHeading, settingsButton, tabTo, test, openHome, openMissions } from './fixtures';

const card = (page: Page, id: string) => page.locator(`[data-mission="${id}"]`);

/** 課題一覧で test-pack の開始ボタンの文言（進捗の有無）を確かめる */
async function expectTestPackButton(page: Page, name: string): Promise<void> {
  await openMissions(page);
  await expect(card(page, 'test-pack').getByRole('button', { name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test('一覧の行は通称だけで、一言の説明・正式名・CWE・分類は ⓘ を開くまで出さない', async ({ page }) => {
  await expect(page.locator('.hero-catch')).not.toContainText('IDOR');
  await expect(page.locator('.hero-catch')).not.toContainText('3 つ');
  await expect(page.locator('.hero')).not.toContainText('わざと壊した');
  const idor = card(page, 'idor');
  await expect(idor.locator('.vulnerability-name')).toHaveText('IDOR');
  await expect(idor.getByText('メモの番号を変えるだけで、他人の非公開メモが読めてしまう問題')).toBeHidden();
  await expect(page.getByText('入門から順に並んでいます')).toHaveCount(0);
  // 通称と題名は 1 行の見出しにまとめる
  await expect(idor.getByRole('heading', { level: 3 })).toHaveText('IDOR - 非公開メモを守る');
  const rectOf = (selector: string) => idor.locator(selector).evaluate((node) => node.getBoundingClientRect().toJSON() as DOMRect);
  expect((await rectOf('.mission-title')).top).toBeLessThan((await rectOf('.vulnerability-name')).bottom);
  expect((await rectOf('.mission-title')).left).toBeGreaterThan((await rectOf('.vulnerability-name')).right);
  await expect(idor.getByText('目安 15 分')).toBeVisible();
  // 行に見えている文字に専門用語を出さない
  const panel = idor.locator('.info-panel');
  await expect(panel).toBeHidden();
  await expect(idor.getByText('CWE-639')).toBeHidden();
  await expect(idor.getByText('安全でない直接オブジェクト参照')).toBeHidden();
  await expect(idor.locator('.mission-summary')).toBeHidden();
  await idor.getByText('課題の概要').click();
  await expect(idor.locator('.mission-summary')).toBeVisible();
  // 未着手の課題に習熟度の★は出さない
  await expect(idor.locator('.mastery-line')).toHaveCount(0);
  // 練習課題は操作の練習なので、脆弱性名も ⓘ も出さない
  await expect(card(page, 'onboarding').locator('.vulnerability-name')).toHaveCount(0);
  await expect(card(page, 'onboarding').locator('.info-button')).toHaveCount(0);
  await expect(card(page, 'onboarding').getByRole('heading', { level: 3 })).toHaveText('練習：はじめての修正');
  await expect(page.getByRole('button', { name: /まずは練習/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'PatchQuest', exact: true })).toBeVisible();
  await expect(page.locator('.hero-catch')).toContainText('セキュリティホールを自分で体験して、なおしてみよう。');
  await expect(page.locator('.hero-catch')).toContainText('自分で体験して');
  await expect(page.getByRole('list', { name: '練習の流れ' }).getByRole('listitem')).toHaveText(['体験する', '直す', 'テストで確かめる']);
  await expect(page.locator('.hero-safe')).toContainText('本物のサービスには触れません');
  await expect(page).toHaveTitle('PatchQuest');
});

test('ⓘ はクリックとキーボード（Enter・Space・Esc）で開閉し、一言 → できるようになること → 用語の順で CWE の説明を添える', async ({ page }) => {
  const idor = card(page, 'idor');
  const info = idor.getByRole('button', { name: 'IDOR の説明' });
  const panel = idor.locator('.info-panel');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await info.click();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  const headings = panel.locator('.eyebrow');
  await expect(headings).toHaveText(['一言でいうと', 'この課題でできるようになること', '用語']);
  await expect(panel.locator('.terms')).toContainText('IDOR（安全でない直接オブジェクト参照）');
  await expect(panel.locator('.terms')).toContainText('持ち主の確認');
  await expect(panel.locator('.terms')).toContainText('CWE-639');
  await expect(panel.locator('.terms')).toContainText('ソフトウェアのセキュリティホールに、共通の番号をつけた一覧');
  await info.click();
  await expect(panel).toBeHidden();

  // キーボードだけ：Enter で開き、Esc で閉じてフォーカスはボタンに残る。Space でも開く
  await tabTo(page, info);
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(info).toBeFocused();
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
});

test('表の最後の行でも、ⓘ の説明は表の枠で切れずに下まで見える', async ({ page }) => {
  const sqli = card(page, 'sqli');
  await sqli.getByRole('button', { name: 'SQL インジェクション の説明' }).click();
  const panel = sqli.locator('.info-panel');
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  // 説明の下端のすぐ内側に、説明そのものが描かれている（表の枠で切り取られていない）
  const bottomIsPanel = await panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.bottom - 4));
  });
  expect(bottomIsPanel).toBe(true);
});

test('課題は練習を先頭に難易度順に並び、難易度と進捗を文字で示し、どの課題もロックされない', async ({ page }) => {
  const table = page.getByRole('list', { name: '課題の一覧' });
  const rows = table.locator('.mission-row');
  await expect(rows).toHaveCount(10);
  // 練習 → 入門（idor, sudo-misconfig, unverified-update, test-pack, shell-test-pack, test-broken はカタログ順）→ 基本（stored-xss, open-redirect）→ 応用（sqli）
  expect(await rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-mission')))).toEqual(['onboarding', 'idor', 'sudo-misconfig', 'unverified-update', 'test-pack', 'shell-test-pack', 'test-broken', 'stored-xss', 'open-redirect', 'sqli']);
  await expect(card(page, 'onboarding').locator('.difficulty-label')).toHaveText('練習');
  await expect(card(page, 'idor').locator('.difficulty-label')).toHaveText('入門');
  await expect(card(page, 'stored-xss').locator('.difficulty-label')).toHaveText('基本');
  await expect(card(page, 'sqli').locator('.difficulty-label')).toHaveText('応用');
  // 順路の飾り（START・番号・GOAL・次の行の強調）は置かない
  await expect(page.locator('.map-marker, .map-goal, [data-next]')).toHaveCount(0);
  for (const id of ['onboarding', 'idor', 'stored-xss', 'sqli']) {
    // 進捗は達成印だけで示す。未着手の行にも「未」の印が並び、「未着手」などの札は出さない
    await expect(card(page, id).locator('.mission-progress .status')).toHaveCount(0);
    await expect(card(page, id).getByRole('list', { name: 'スタンプ' })).toContainText('再現：未達成');
    await expect(card(page, id).getByRole('button', { name: 'この課題を始める' })).toBeEnabled();
  }
  // Tab 順は表の順。練習の開始ボタンの次に入門の開始ボタンが来る
  await tabTo(page, card(page, 'onboarding').getByRole('button', { name: 'この課題を始める' }));
  await tabTo(page, card(page, 'idor').getByRole('button', { name: 'この課題を始める' }), 3);
});

test('キーボードだけで課題一覧から始めると、開始前チェックに合格したところでそのまま導入へ進む', async ({ page }) => {
  await tabTo(page, 'この課題を始める');
  await page.keyboard.press('Enter');
  // 見出しは課題名。長く待つ課題ではないので、待ち時間の案内は出さない
  await expect(preflightHeading(page)).toBeVisible();
  await expect(preflightHeading(page)).not.toHaveText('');
  await expect(page.locator('[data-anchor="preflight"]')).toContainText('準備しています…');
  await expect(page.locator('[data-anchor="preflight"]')).not.toContainText('秒程度かかります');
  // 準備の内容はふだん畳んである
  await expect(page.locator('.preflight-details summary')).toHaveText('準備の内容');
  await expect(page.locator('.preflight-details')).not.toHaveAttribute('open', '');

  // 合格すると、ボタンを押さずに導入へ進み、「ミッション開始」にフォーカスが移る
  await expect(launchButton(page)).toBeFocused({ timeout: 15_000 });
  await expect(page.locator('.check .status-passed')).toHaveCount(4);
  await expect(preflightHeading(page)).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exercise-title')).toBeFocused();
  await expect(page.locator('footer .fictional-label')).toContainText('学習用に、わざとセキュリティホールを入れた架空のサービスです。');
  await expect(page.getByRole('list', { name: 'スタンプ' })).toContainText('再現：未達成');
});

test('攻撃が成立しない課題は開始できず、理由と次の操作を示す', async ({ page }) => {
  await card(page, 'test-broken').getByRole('button', { name: 'この課題を始める' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('開始できません（あなたの不合格には数えません）', { timeout: 15_000 });
  await expect(alert).toContainText('注入後に攻撃が成立しませんでした');
  await expect(page.locator('.check').filter({ hasText: 'セキュリティホールを入れると' }).locator('.status')).toHaveText(/不合格/);
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await backToList(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'PatchQuest', exact: true })).toBeVisible();
});

test('進捗を保存し、続きから始め、書き出し・読み込み・削除ができる', async ({ page }) => {
  await card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' }).click();
  await enterWorkbench(page);
  // 始めただけ（達成印が 3 つとも未）の記録では、ボタンは「この課題を始める」のまま
  await backToList(page).click();
  await expect(card(page, 'test-pack').getByRole('list', { name: 'スタンプ' })).toContainText('再現：未達成');
  await expect(card(page, 'test-pack').locator('.mission-actions').getByRole('button')).toHaveText(['この課題を始める']);

  // 達成印が 1 つ付くと「続きから始める」と「最初から始める」になる
  await card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' }).click();
  const ticket = await enterAndReproduce(page);
  await backToList(page).click();
  await expect(card(page, 'test-pack').getByRole('list', { name: 'スタンプ' })).toContainText('再現：達成');
  await expect(card(page, 'test-pack').locator('.mission-actions').getByRole('button')).toHaveText(['続きから始める', '最初から始める']);

  // 続きから始めると、同じ演習票（同じ seed）で環境を作り直す
  await card(page, 'test-pack').getByRole('button', { name: '続きから始める' }).click();
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).toHaveText(ticket);
  await backToList(page).click();

  // 課題一覧に進捗の区画はなく、見出しの移動にも「進捗」はない
  await expect(page.getByRole('region', { name: '進捗', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'ページ' }).getByRole('button')).toHaveText(['課題', '記録']);

  // 進捗の道具は設定にある。戻った直後は見出しへスクロールしているので、ボタンを中央に寄せてから押す
  await settingsButton(page).evaluate((button) => button.scrollIntoView({ block: 'center' }));
  await settingsButton(page).click();
  const dialog = page.getByRole('dialog', { name: '設定' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '進捗を書き出す' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^patchquest-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(exported).toMatchObject({ format: 'patchquest-progress', attempts: expect.arrayContaining([expect.objectContaining({ missionId: 'test-pack' })]) });

  // 不正なファイルは拒否し、今の進捗を残す
  await dialog.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(dialog.getByRole('alert')).toContainText('今の進捗はそのままです');
  await expectTestPackButton(page, '続きから始める');

  // 削除は確認してから行う。やめるを選べば何も消えない
  await dialog.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.keyboard.press('Escape');
  await expectTestPackButton(page, '続きから始める');
  await dialog.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expectTestPackButton(page, 'この課題を始める');

  // 書き出したファイルを読み込めば元に戻る
  await dialog.locator('input[type=file]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expectTestPackButton(page, '続きから始める');
  // 前の読み込みの失敗の注記は残さない
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('ブラウザに保存できないときは、書き出しを促す', async ({ page }) => {
  await blockIndexedDb(page);
  await page.reload();
  await expect(page.getByText(/ブラウザに保存できません.*設定の「進捗を書き出す」で保存してください/)).toBeVisible();
  await page.getByRole('button', { name: '設定を開く' }).click();
  await expect(page.getByRole('dialog', { name: '設定' }).getByRole('button', { name: '進捗を書き出す' })).toBeVisible();
});
