// 再現の通知・対策タブの検証結果・達成印・音が、実際の評価結果と一致することを確かめる。
import { backToList, expect, openMission, settingsButton, startMission, test, ticketSeals, verifyResults, verifyWith } from './fixtures';

const ownerDefense = '取り出すときに、ログイン中の利用者が持ち主かを確かめる';

test('調査で再現し、不十分な対策から防御成功へ進むと結果と達成印が一致する', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startMission(page, 'idor');
  await page.getByRole('tab', { name: '調査' }).click();
  const entry = page.locator('.log-entry').filter({ hasText: 'GET /api/memos' }).first();
  await entry.locator('summary').click();
  const body: unknown = JSON.parse(await entry.locator('.log-block').nth(1).locator('pre').innerText());
  const parsed = body as { memos: { id: number }[] };
  const memo = parsed.memos.find((item) => Reflect.get(item, 'title') === '非公開のメモ');
  if (!memo) throw new Error('一覧にメモがありません');
  await page.getByRole('radio', { name: /^bob/ }).check();
  await page.getByLabel('メモの ID', { exact: true }).fill(String(memo.id));
  await page.getByRole('button', { name: '送る', exact: true }).nth(1).click();
  const callout = page.locator('.result-callout');
  await expect(callout).toContainText('セキュリティホールを再現できました');
  // 再現の通知は 1 行で、キャラクターの発言を添えない
  await expect(callout.locator('[data-character]')).toHaveCount(0);
  // 読み上げは常設の live 領域で行う
  await expect(page.locator('[aria-live="polite"]')).toContainText('セキュリティホールを再現できました');
  await expect(ticketSeals(page)).toContainText('再現：達成');
  await callout.getByRole('button', { name: '閉じる' }).click();
  await expect(callout).toBeHidden();
  // 検証の結果は対策タブにだけ出し、作業台の上には重ねない
  const results = verifyResults(page);
  await expect(results).toBeHidden();
  await verifyWith(page, '画面のリンクだけを隠す');
  await expect(results).toContainText('まだ合格ではありません', { timeout: 15_000 });
  await expect(results).toContainText('攻撃をまだ防げていません');
  await expect(results).toContainText('別の利用者のメモは読めない');
  // 失敗は 1 件ずつ分け、理由と題名・正しい結果・実際の結果を行を分けて示す
  await expect(results.locator('.verdict-failures li').first().locator('.verdict-failure-title')).toHaveText(/^攻撃をまだ防げていません：/);
  await expect(results.locator('.verdict-failures li').first().locator('dt')).toHaveText(['正しい結果', '実際の結果']);
  await expect(page.locator('[aria-live="polite"]')).toContainText('まだ合格ではありません');
  await expect(callout).toBeHidden();
  await expect(ticketSeals(page)).toContainText('防御：未達成');
  await verifyWith(page, ownerDefense);
  await expect(results).toContainText('防御できました', { timeout: 15_000 });
  await expect(page.locator('[aria-live="polite"]')).toContainText('防御できました');
  await expect(results.locator('.verdict-failures')).toHaveCount(0);
  await expect(callout).toBeHidden();
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await expect(results.locator('.result-group h4')).toHaveText([/攻撃を防げたか/, /ふだんの使い方ができるか/, /ほかの守りが壊れていないか/]);
  await page.getByRole('button', { name: '最初の状態に戻す', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '最初の状態に戻す', exact: true }).click();
  await backToList(page).click();
  await openMission(page, 'idor');
  await expect(callout).toBeHidden();
  await expect(verifyResults(page)).toBeHidden();
});

for (const enabled of [false, true]) {
  test(`効果音が${enabled ? 'オンなら音を作り音量を保存する' : '既定のオフなら音を作らない'}`, async ({ page }) => {
    await page.addInitScript(() => {
      let created = 0;
      const gains: number[] = [];
      Object.defineProperty(window, 'audioGains', { get: () => gains });
      Object.defineProperty(window, 'audioCreated', { get: () => created });
      class RecordingAudio {
        currentTime = 0;
        destination = {};
        constructor() { created++; }
        async resume() { await Promise.resolve(); }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value: number) { gains.push(value); } }, connect() {}, disconnect() {} }; }
        createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
      }
      Object.defineProperty(window, 'AudioContext', { value: RecordingAudio });
    });
    await startMission(page, 'idor');
    if (enabled) {
      await settingsButton(page).click();
      await page.getByRole('checkbox', { name: '効果音を鳴らす' }).check();
      const volume = page.getByRole('slider', { name: '音量' });
      await volume.focus();
      await volume.press('Home');
      for (let index = 0; index < 3; index++) await volume.press('ArrowRight');
      await volume.press('Tab');
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
    }
    await verifyWith(page, ownerDefense);
    await expect(verifyResults(page)).toContainText('防御できました', { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioCreated') as number)).toBe(enabled ? 1 : 0);
    await expect(ticketSeals(page)).toContainText('防御：達成');
    if (enabled) {
      await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioGains') as number[])).toContain(0.06);
      await settingsButton(page).click();
      await expect(page.getByRole('slider', { name: '音量' })).toHaveValue('0.3');
      await page.getByRole('checkbox', { name: '効果音を鳴らす' }).uncheck();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
      await page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' }).click();
      await expect(page.getByRole('button', { name: '攻撃とふだんの使い方をテストする' })).toBeEnabled({ timeout: 15_000 });
      expect(await page.evaluate(() => Reflect.get(window, 'audioGains') as number[])).toHaveLength(2);
    }
  });
}
