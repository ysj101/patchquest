// 学習UI：対策パネル・検証結果・ヒント・振り返り（Issue #13）
import { backToList, enterWorkbench, expect, openMission, openRawRequest, reproduceNoteLeak, preview, startMission, test, ticketSeals as seals, verifyResults, verifyWith } from './fixtures';

test.beforeEach(async ({ page }) => {
  await startMission(page, 'test-pack');
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
});

test('正常系を壊す対策は、検証結果に理由と期待・実測が出て合格しない', async ({ page }) => {
  await verifyWith(page, 'すべて拒否する');
  const results = verifyResults(page);
  await expect(results).toContainText('まだ合格ではありません ふだんの使い方が壊れています。', { timeout: 15_000 });
  await expect(results.locator('.conclusion[data-group="normal"]')).toContainText('不合格');
  await expect(results.locator('.outcome').first()).toBeHidden();
  await expect(seals(page)).toContainText('防御：未達成');
  await expect(page.getByRole('heading', { name: 'テストの結果' })).toBeFocused();
  await results.getByRole('button', { name: '詳しく見る', exact: true }).click();
  const normal = results.locator('.result-group').filter({ hasText: 'ふだんの使い方ができるか' });
  await expect(normal.locator('.outcome')).toContainText('不合格');
  await expect(normal.locator('.outcome')).toContainText('正しい結果');
  await expect(normal.locator('.outcome')).toContainText('status が 200 ではない（実際は 403）');
});

test('再現・正しい対策・理解確認をそろえると解決になり、対策を変えると防御は再検証待ちになる', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  await reproduceNoteLeak(page);
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 15_000 });
  await expect(seals(page)).toContainText('防御：達成');

  await page.getByRole('tab', { name: '振り返り' }).click();
  await expect(page.getByRole('tabpanel', { name: '振り返り' })).toContainText('所有者を照合していない');
  // 原因と効く理由は開いたままにし、覚えておくこと・改善履歴は畳んでおく
  const debrief = page.getByRole('tabpanel', { name: '振り返り' });
  await expect(debrief).toContainText('取得時に照合する');
  await expect(debrief.getByText('画面ではなく処理で守る')).toBeHidden();
  await debrief.locator('.debrief-takeaway summary').click();
  await expect(debrief.getByText('画面ではなく処理で守る')).toBeVisible();
  await expect(debrief.locator('.security-history')).not.toHaveAttribute('open');
  await expect(debrief.locator('.security-history summary')).toHaveText('改善履歴');
  await page.getByRole('radio', { name: '一覧のリンクを隠す' }).check();
  await page.getByRole('button', { name: '答える' }).click();
  await expect(page.locator('.question')).toContainText('不正解');
  // 設問を描き直しても、フォーカスは設問の見出しに残る
  await expect(page.getByRole('heading', { name: '理解の確認' })).toBeFocused();
  await expect(page.locator('.question')).toContainText('直接の要求は防げない');
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '答える' }).click();
  await expect(seals(page)).toContainText('理解：達成');
  // 3 つのスタンプがそろうと、ステージはすべて済みになる
  await expect(page.getByRole('list', { name: 'ステージ', exact: true }).locator('li[data-state="done"]')).toHaveCount(5);

  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '対策を外す' }).click();
  await expect(verifyResults(page)).toContainText('これは前の結果です');
  await expect(seals(page)).toContainText('防御：記録あり（もう一度テストすると確定）');
});

test('キーボードで対策を選ぶとその場で使われ、説明は選んだ対策の分だけ出て、続けて検証できる', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '対策' })).toBeFocused();
  // 始めはどれも選ばれておらず、説明も参考コードも外すボタンも出ていない
  const options = page.locator('.defense-option');
  const checked = page.locator('.defense-choices').getByRole('radio', { checked: true });
  await expect(checked).toHaveCount(0);
  await expect(options.locator('.note').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'この対策を使う' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '対策を外す' })).toBeHidden();
  await expect(page.locator('.reference-code')).toBeHidden();
  await page.getByRole('radio', { name: /所有者を照合する/ }).focus();
  await page.keyboard.press('ArrowDown');
  const chosen = page.getByRole('radio', { name: /すべて拒否する/ });
  await expect(chosen).toBeChecked();
  await expect(page.getByText('使っている対策：すべて拒否する')).toBeVisible();
  // 切り替えのあとも、フォーカスは選んだ対策に残る
  await expect(chosen).toBeFocused();
  await expect(options.locator('.note').filter({ visible: true })).toHaveCount(1);
  await expect(options.filter({ has: chosen }).locator('.note')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.reference-code summary')).toBeFocused();
  await page.getByRole('button', { name: '対策を外す' }).click();
  await expect(checked).toHaveCount(0);
  await expect(page.getByText('対策は使っていません（セキュリティホールが残った状態）')).toBeVisible();
  await chosen.check();
  await expect(page.getByText('使っている対策：すべて拒否する')).toBeVisible();
  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).focus();
  await page.keyboard.press('Enter');
  await expect(verifyResults(page)).toContainText('まだ合格ではありません', { timeout: 15_000 });
});

test('ヒントは段階的に開け、解法は確認してから表示する', async ({ page }) => {
  const hints = page.getByRole('tabpanel', { name: '調査' }).locator('[data-anchor="hints"]');
  await hints.getByRole('button', { name: 'ヒント 1（見るところ）を見る' }).click();
  await expect(hints).toContainText('ID を変えると何が返るか');
  await expect(hints.getByRole('button', { name: 'ヒント 2（調べ方）を見る' })).toBeFocused();
  await page.keyboard.press('Enter');
  await hints.getByRole('button', { name: 'ヒント 3（直し方）を見る' }).click();
  await hints.getByRole('button', { name: '解法を見る' }).click();
  await expect(page.getByRole('dialog')).toContainText('記録に残ります');
  await page.getByRole('dialog').getByRole('button', { name: '解法を見る' }).click();
  await expect(hints).toContainText('note.read で所有者を照合する');
  // `…` で囲んだ部分は、ヒントでも解法でも等幅のコードで出る
  await expect(hints.locator('.hint code')).toHaveText(['note.read', 'note.read']);
  // 押したボタンがなくなっても、フォーカスは開いた解法に残る
  await expect(hints.locator('.hint-solution')).toBeFocused();
});

test('最初の状態に戻すと対策とデータが戻り、課題一覧から最初から始めると新しい演習票になる', async ({ page }) => {
  const editor = page.locator('[data-anchor="request-editor"]');
  await page.getByRole('tab', { name: '調査' }).click();
  await openRawRequest(page);
  await editor.getByLabel('メソッド').selectOption('POST');
  await editor.getByLabel('パス').fill('/notes');
  await editor.getByLabel('本文（JSON）').fill('{"body":"あとで消えるノート"}');
  await editor.getByRole('button', { name: 'このリクエストを送る' }).click();
  await page.getByRole('button', { name: '最初の画面を開き直す' }).click();
  await expect(preview(page).getByText('あとで消えるノート')).toBeVisible();
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 15_000 });

  await page.getByRole('button', { name: '最初の状態に戻す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最初の状態に戻す' }).click();
  await expect(page.getByText('対策は使っていません（セキュリティホールが残った状態）')).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
  await expect(preview(page).getByText('あとで消えるノート')).toHaveCount(0);

  const ticket = await page.locator('.ticket-id').textContent();
  await backToList(page).click();
  await openMission(page, 'test-pack');
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).not.toHaveText(ticket!);
  await expect(seals(page)).toContainText('再現：未達成');
});

test('不合格のあと①に戻って、別の対策を選び直せる', async ({ page }) => {
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(page.getByRole('heading', { name: '① 対策を選ぶ' })).toBeVisible();
  // テストするまでは、結果の区画を出さない
  await expect(verifyResults(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: '② テストする' })).toBeVisible();
  await expect(page.locator('.reference-code')).not.toHaveAttribute('open');
  await expect(page.getByRole('button', { name: '① に戻って対策を選び直す' })).toBeHidden();

  await verifyWith(page, 'すべて拒否する');
  const results = verifyResults(page);
  await expect(results).toContainText('まだ合格ではありません', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'テストの結果' })).toBeFocused();
  const back = page.getByRole('button', { name: '① に戻って対策を選び直す' });
  await expect(back).toBeVisible();
  const verdictBox = await results.locator('.banner-error').boundingBox();
  const backBox = await back.boundingBox();
  const verifyBox = await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).boundingBox();
  const appliedBox = await page.locator('.applied').boundingBox();
  if (!verdictBox || !backBox || !verifyBox || !appliedBox) throw new Error('対策タブの配置を測れません');
  expect(appliedBox.y).toBeLessThan(verifyBox.y);
  expect(verifyBox.y).toBeLessThan(verdictBox.y);
  expect(verdictBox.y).toBeLessThan(backBox.y);

  await back.click();
  await expect(page.getByRole('radio', { name: /すべて拒否する/ })).toBeFocused();
  await verifyWith(page, '所有者を照合する');
  await expect(results).toContainText('防御できました', { timeout: 15_000 });
  await expect(back).toBeHidden();
});

test('対策を適用した演習を続きから始めると、開始前チェックの後に前回の対策を適用し直して演習を始められる', async ({ page }) => {
  await verifyWith(page, '所有者を照合する');
  await expect(verifyResults(page)).toContainText('防御できました', { timeout: 15_000 });
  await backToList(page).click();

  await page.locator('[data-mission="test-pack"]').getByRole('button', { name: '続きから始める' }).click();
  await enterWorkbench(page);
  await expect(page.locator('.exercise').getByText('前回の対策「所有者を照合する」を使い直しました')).toBeVisible();
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(page.getByText('使っている対策：所有者を照合する')).toBeVisible();
  // 記録の合格は、再検証するまで現在の合格として扱わない
  await expect(seals(page)).toContainText('防御：記録あり（もう一度テストすると確定）');
});

test('区画の補足は ⓘ に畳んであり、キーボードで開いて読め、Esc で閉じる', async ({ page }) => {
  await page.getByRole('tab', { name: '対策' }).click();
  const panel = page.getByRole('tabpanel', { name: '対策' });
  await expect(panel).not.toContainText('直し方のヒントです。', { useInnerText: true });
  await expect(panel).not.toContainText('自動で確かめます', { useInnerText: true });
  await expect(panel).not.toContainText('スタンプは残ります', { useInnerText: true });

  const hint = panel.getByRole('button', { name: 'ヒント の説明' });
  await hint.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('note').filter({ hasText: '直し方のヒントです。調べるときのヒントは、「調査」のタブにあります。見ても減点はありません。' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('note').filter({ hasText: '直し方のヒントです。' })).toBeHidden();
  await expect(hint).toBeFocused();

  await panel.getByRole('button', { name: '② テストする の説明' }).click();
  await expect(panel.getByRole('note').filter({ hasText: '攻撃を防げたか、ふだんの使い方ができるかを、自動で確かめます。' })).toBeVisible();
  await panel.getByRole('button', { name: 'やり直す の説明' }).click();
  await expect(panel.getByRole('note').filter({ hasText: '使った対策を外し、データも最初の状態に戻します。スタンプは残ります。' })).toBeVisible();

  const log = page.locator('[data-anchor="investigation-log"]');
  await expect(log).not.toContainText('本物の通信ではありません', { useInnerText: true });
  await log.getByRole('button', { name: '観測ログ の説明' }).click();
  await expect(log.getByRole('note')).toContainText('本物の通信ではありません');
});
