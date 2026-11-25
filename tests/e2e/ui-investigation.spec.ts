// 学習UI：演習画面と調査パネル（Issue #12）
import type { Page } from '@playwright/test';
import { expect, openRawRequest, preview, startMission, test } from './fixtures';

async function startExercise(page: Page): Promise<void> {
  await startMission(page, 'test-pack');
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
}

/** 観測ログに記録された、alice の一覧取得の応答からノート ID を読む */
async function aliceNoteId(page: Page): Promise<number> {
  const entry = page.locator('.log-entry').filter({ hasText: /alice → GET \/notes(?!\/)/ }).first();
  await entry.locator('summary').click();
  const body = await entry.locator('.log-block').nth(1).locator('pre').textContent();
  return (JSON.parse(body!) as { notes: { id: number }[] }).notes[0]!.id;
}

test.beforeEach(async ({ page }) => {
  await startExercise(page);
});

test('依頼の文は「依頼」に重ねて一度だけ出て、守るものと壊さないことは帯に常に出て、矢印キーでタブを切り替えられる', async ({ page }) => {
  const request = page.locator('.desk-request');
  await expect(request.getByRole('note')).toBeHidden();
  await request.getByRole('button', { name: '依頼' }).hover();
  await expect(request.getByRole('note')).toContainText('他人のノートが見える');
  await page.locator('.now-doing').hover();
  await expect(request.getByRole('note')).toBeHidden();
  await request.getByRole('button', { name: '依頼' }).press('Enter');
  await expect(request.getByRole('note')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(request.getByRole('note')).toBeHidden();
  await expect(page.locator('.tools')).not.toContainText('他人のノートが見える');
  await expect(page.locator('.now-doing')).toContainText('今やること：');
  // 「状況」タブは置かず、対策を選ぶ基準は帯に 1 行で出す
  await expect(page.getByRole('tab')).toHaveText(['調査', '対策', '振り返り']);
  await expect(page.locator('.desk-goal dt')).toHaveText(['守るもの', '壊さないこと']);
  await expect(page.locator('.desk-goal dd')).toHaveText(['ノート本文', '本人がノートを読める']);
  await expect(page.getByRole('tab', { name: '調査' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '調査' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '対策' })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '調査' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: '調査' })).toContainText('本物の通信ではありません');
});

test('キーボードで利用者を切り替え、定型の操作で事故を再現すると再現の検印が押される', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  const id = await aliceNoteId(page);

  await page.getByRole('radio', { name: 'alice' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'bob' })).toBeChecked();
  await expect(preview(page).getByRole('heading', { name: 'ノート（bob）' })).toBeVisible();
  await expect(page.locator('.viewer')).toHaveText('bob');

  await page.getByLabel('ノート ID').fill(String(id));
  await page.getByLabel('ノート ID').press('Enter');
  // 送信のあとプレビューの一覧取得がログの先頭に足される。送ったリクエスト自体を読む
  const entry = page.locator('.log-entry').filter({ hasText: `bob → GET /notes/${id}` });
  await expect(entry.locator('summary')).toContainText(`bob → GET /notes/${id}`);
  await expect(entry.locator('.status')).toHaveText(/200/);
  await expect(page.getByRole('list', { name: 'スタンプ' })).toContainText('再現：達成');
});

test('調査タブでは生の編集欄が畳まれ、上級者向けを開くと編集して送れ、開いている間だけ出るコピーも入る', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  const editor = page.locator('[data-anchor="request-editor"]');
  await expect(editor).not.toHaveAttribute('open');
  await expect(editor.getByRole('button', { name: 'このリクエストを送る' })).toBeHidden();
  await expect(page.getByRole('button', { name: '送る', exact: true })).toBeVisible();

  await page.getByLabel('ノート ID').fill('7');
  const copy = page.getByRole('button', { name: '編集欄にコピー' });
  await expect(copy).toBeHidden();
  await openRawRequest(page);
  await copy.click();
  await expect(editor.getByLabel('メソッド')).toHaveValue('GET');
  await expect(editor.getByLabel('パス')).toHaveValue('/notes/7');
  await editor.getByRole('button', { name: 'このリクエストを送る' }).click();
  await expect(page.locator('.log-entry').filter({ hasText: 'alice → GET /notes/7' }).locator('summary')).toBeVisible();
});

test('操作の説明と入力欄の補足は ⓘ に畳んであり、マウスを乗せるか押すと読める', async ({ page }) => {
  const actions = page.locator('[data-anchor="actions"]');
  await expect(actions).not.toContainText('ノートを ID で取得する', { useInnerText: true });
  const info = actions.locator('.action').first().getByRole('button', { name: / の説明$/ }).first();
  await info.hover();
  await expect(actions.getByRole('note').filter({ hasText: 'ノートを ID で取得する' })).toBeVisible();
  await page.locator('.now-doing').hover();
  await expect(actions.getByRole('note').filter({ hasText: 'ノートを ID で取得する' })).toBeHidden();
  await info.press('Enter');
  await expect(actions.getByRole('note').filter({ hasText: 'ノートを ID で取得する' })).toBeVisible();
  // 補足を持つ入力欄は、ラベルの横に ⓘ を置く。ラベルは入力欄だけを指す
  await startMission(page, 'idor');
  await expect(page.getByLabel('メモの ID', { exact: true })).toHaveCount(1);
  const help = page.getByRole('button', { name: 'メモの ID の説明' });
  await help.click();
  await expect(help.locator('xpath=..').getByRole('note')).toBeVisible();
});

test('どの課題の調査タブでも、生の編集欄は畳まれたまま操作が見える', async ({ page }) => {
  for (const missionId of ['test-pack', 'idor', 'onboarding', 'sqli', 'stored-xss']) {
    await startMission(page, missionId);
    await page.getByRole('tab', { name: '調査' }).click();
    const editor = page.locator('[data-anchor="request-editor"]');
    await expect(editor, missionId).not.toHaveAttribute('open');
    await expect(editor.locator('summary'), missionId).toHaveText('上級者向け');
    await expect(page.locator('[data-anchor="actions"]'), missionId).toBeVisible();
  }
});

test('リクエスト編集欄は入力の誤りと大きすぎる入力を理由付きで知らせる', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  await openRawRequest(page);
  const editor = page.locator('[data-anchor="request-editor"]');
  const send = editor.getByRole('button', { name: 'このリクエストを送る' });

  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill('{ body: こわれた JSON }');
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText(/本文は JSON で書いてください/);

  await editor.getByLabel('パス').fill('notes');
  await editor.getByLabel('本文（JSON）').fill('{}');
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText('パスは / から始めてください');

  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill(JSON.stringify({ body: 'あ'.repeat(3000) }));
  await send.click();
  await expect(editor.getByRole('alert')).toHaveText(/入力が大きすぎます/);
});

test('教材由来の文字列は観測ログでも文字のまま表示され、HTML として解釈されない', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', (d) => (dialogs.push(d.message()), void d.dismiss()));
  await page.getByRole('tab', { name: '調査' }).click();
  await openRawRequest(page);
  const editor = page.locator('[data-anchor="request-editor"]');
  const payload = '<img src="x" onerror="alert(1)"><b>太字</b>';
  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill(JSON.stringify({ body: payload }));
  await editor.getByRole('button', { name: 'このリクエストを送る' }).click();

  // 送信後にプレビューが描き直され、保存した本文が一覧へ出る。ログもその一覧取得を開く
  await expect(preview(page).getByText(payload)).toBeVisible();
  const listing = page.locator('.log-entry').filter({ hasText: /alice → GET \/notes(?!\/)/ }).first();
  await listing.locator('summary').click();
  await expect(listing).toContainText(payload.replaceAll('"', '\\"'));
  await expect(page.locator('.log img, .log b')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test('調べ方・操作のしかたを持たない課題では調査タブ・対策タブに出さず、ヒントは調査タブで順に開け、対策タブには直し方だけが出る', async ({ page }) => {
  const investigation = page.getByRole('tabpanel', { name: '調査' });
  await page.getByRole('tab', { name: '調査' }).click();
  await expect(investigation.getByRole('heading', { name: '調べ方' })).toHaveCount(0);
  await expect(investigation.getByRole('region', { name: 'ヒント' })).toBeVisible();

  await investigation.getByRole('button', { name: 'ヒント 1（見るところ）を見る' }).click();
  await expect(investigation.locator('.hint')).toHaveCount(1);
  await expect(investigation.getByRole('button', { name: 'ヒント 2（調べ方）を見る' })).toBeFocused();

  await investigation.getByRole('button', { name: 'ヒント 2（調べ方）を見る' }).click();
  await expect(investigation.locator('.hint')).toHaveCount(2);

  const repair = page.getByRole('tabpanel', { name: '対策' });
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(repair.getByRole('heading', { name: '操作のしかた' })).toHaveCount(0);
  // 対策タブには、調べるときのヒント（見るところ・調べ方）を出さない
  await expect(repair.locator('.hint')).toHaveCount(0);
  await repair.getByRole('button', { name: 'ヒント 3（直し方）を見る' }).click();
  await expect(repair.locator('.hint')).toHaveCount(1);
  await expect(repair.locator('.hint .eyebrow')).toHaveText('ヒント 3：直し方');
  await page.getByRole('tab', { name: '調査' }).click();
  await expect(investigation.locator('.hint')).toHaveCount(3);
});

test('対策タブでは、見るところ・調べ方のヒントを開いていなくても、直し方のヒントと解法を開ける', async ({ page }) => {
  const repair = page.getByRole('tabpanel', { name: '対策' });
  await page.getByRole('tab', { name: '対策' }).click();
  const hints = repair.getByRole('region', { name: 'ヒント' });
  await expect(hints.getByRole('button', { name: /ヒント [12]/ })).toHaveCount(0);
  await hints.getByRole('button', { name: 'ヒント 3（直し方）を見る' }).click();
  await expect(hints.locator('.hint .eyebrow')).toHaveText('ヒント 3：直し方');
  // 直し方を開いたら、続けて解法を開ける
  await expect(hints.getByRole('button', { name: '解法を見る' })).toBeFocused();

  // 調査タブでは、開いた直し方を段階の順（3 番目）に置き、見るところから順に開ける
  const investigation = page.getByRole('tabpanel', { name: '調査' });
  await page.getByRole('tab', { name: '調査' }).click();
  await expect(investigation.locator('.hint .eyebrow')).toHaveText('ヒント 3：直し方');
  await expect(investigation.getByRole('button', { name: '解法を見る' })).toHaveCount(0);
  await investigation.getByRole('button', { name: 'ヒント 1（見るところ）を見る' }).click();
  await investigation.getByRole('button', { name: 'ヒント 2（調べ方）を見る' }).click();
  await expect(investigation.locator('.hint .eyebrow')).toHaveText(['ヒント 1：見るところ', 'ヒント 2：調べ方', 'ヒント 3：直し方']);
  await expect(investigation.getByRole('button', { name: '解法を見る' })).toBeFocused();
});
