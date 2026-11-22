// 学習UI：対策パネル・検証結果・ヒント・振り返り（Issue #13）
import { backToList, enterWorkbench, expect, openRawRequest, reproduceNoteLeak, preview, startMission, test, ticketSeals as seals, verifyResults, verifyWith } from './fixtures';

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
  await page.getByRole('radio', { name: '一覧のリンクを隠す' }).check();
  await page.getByRole('button', { name: '答える' }).click();
  await expect(page.locator('.question')).toContainText('不正解');
  // 設問を描き直しても、フォーカスは設問の見出しに残る
  await expect(page.getByRole('heading', { name: '理解の確認' })).toBeFocused();
  await expect(page.locator('.question')).toContainText('直接の要求は防げない');
  await page.getByRole('radio', { name: '取得時に所有者を照合する' }).check();
  await page.getByRole('button', { name: '答える' }).click();
  await expect(seals(page)).toContainText('理解：達成');
  await expect(page.locator('.state-stamp')).toHaveText('解決');

  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('button', { name: '対策を外す' }).click();
  await expect(verifyResults(page)).toContainText('これは前の結果です');
  await expect(seals(page)).toContainText('防御：記録あり（もう一度テストすると確定）');
  await expect(page.locator('.state-stamp')).toHaveText('対策中');
});

test('キーボードで対策を選び、適用して検証できる', async ({ page }) => {
  await page.getByRole('tab', { name: '状況' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '対策' })).toBeFocused();
  await page.getByRole('radio', { name: /所有者を照合する/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /すべて拒否する/ })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.locator('.reference-code summary')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByText('使っている対策：すべて拒否する')).toBeVisible();
  await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).focus();
  await page.keyboard.press('Enter');
  await expect(verifyResults(page)).toContainText('まだ合格ではありません', { timeout: 15_000 });
});

test('ヒントは段階的に開け、解法は確認してから表示する', async ({ page }) => {
  const hints = page.getByRole('tabpanel', { name: '状況' }).locator('[data-anchor="hints"]');
  await hints.getByRole('button', { name: 'ヒント 1（見るところ）を見る' }).click();
  await expect(hints).toContainText('ID を変えると何が返るか');
  await expect(hints.getByRole('button', { name: 'ヒント 2（調べ方）を見る' })).toBeFocused();
  await page.keyboard.press('Enter');
  await hints.getByRole('button', { name: 'ヒント 3（直し方）を見る' }).click();
  await hints.getByRole('button', { name: '解法を見る' }).click();
  await expect(page.getByRole('dialog')).toContainText('記録に残ります');
  await page.getByRole('dialog').getByRole('button', { name: '解法を見る' }).click();
  await expect(hints).toContainText('note.read で所有者を照合する');
  // 押したボタンがなくなっても、フォーカスは開いた解法に残る
  await expect(hints.locator('.hint-solution')).toBeFocused();
});

test('最初の状態に戻すと対策とデータが戻り、新しいデータで再挑戦すると新しい演習票になる', async ({ page }) => {
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
  // 戻した直後に画面を開き直すので、「調査を始められます」か「調査中」になる
  await expect(page.locator('.state-stamp')).toHaveText(/調査/);
  await expect(page.getByText('対策は使っていません（セキュリティホールが残った状態）')).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: 'ノート（alice）' })).toBeVisible();
  await expect(preview(page).getByText('あとで消えるノート')).toHaveCount(0);

  const ticket = await page.locator('.ticket-id').textContent();
  await page.getByRole('tab', { name: '振り返り' }).click();
  await page.getByRole('button', { name: '新しいデータでもう一度挑戦する' }).click();
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).not.toHaveText(ticket!);
  await expect(seals(page)).toContainText('再現：未達成');
});

test('不合格のあと①に戻って、別の対策を選び直せる', async ({ page }) => {
  await page.getByRole('tab', { name: '対策' }).click();
  await expect(page.getByRole('heading', { name: '① 対策を選んで使う' })).toBeVisible();
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
  await expect(panel).not.toContainText('困ったら、順番に開けます。', { useInnerText: true });
  await expect(panel).not.toContainText('自動で確かめます', { useInnerText: true });
  await expect(panel).not.toContainText('スタンプは残ります', { useInnerText: true });

  const hint = panel.getByRole('button', { name: 'ヒント の説明' });
  await hint.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('note').filter({ hasText: '困ったら、順番に開けます。見ても減点はありません。' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('note').filter({ hasText: '困ったら、順番に開けます。' })).toBeHidden();
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
