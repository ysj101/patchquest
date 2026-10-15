// 観測・検証結果とコールアウト、達成印、音の一致を確かめる。
import { expect, openMission, settingsButton, startMission, test, ticketSeals, verifyResults, verifyWith } from './fixtures';

const ownerDefense = '取り出す処理で、ログイン中の利用者と所有者を照合する';

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
  await page.getByLabel('メモの ID').fill(String(memo.id));
  await page.getByRole('button', { name: '送る', exact: true }).nth(1).click();
  const callout = page.locator('.result-callout');
  await expect(callout).toContainText('脆弱性を再現しました');
  // 読み上げは常設の live 領域で行う
  await expect(page.locator('[aria-live="polite"]')).toContainText('脆弱性を再現しました');
  await expect(ticketSeals(page)).toContainText('再現：達成');
  await verifyWith(page, '画面のリンクだけを隠す');
  await expect(callout).toContainText('まだ合格ではありません', { timeout: 15_000 });
  await expect(callout).toContainText('攻撃をまだ防げていません');
  await expect(callout).toContainText('別の利用者のメモは読めない');
  await expect(ticketSeals(page)).toContainText('防御：未達成');
  await verifyWith(page, ownerDefense);
  await expect(callout).toContainText('防御できました', { timeout: 15_000 });
  await expect(ticketSeals(page)).toContainText('防御：達成');
  await expect(verifyResults(page).locator('.result-group h4')).toHaveText([/攻撃を防げたか/, /正常な利用ができるか/, /ほかの守りが壊れていないか/]);
  await callout.getByRole('button', { name: '結果を閉じる' }).click();
  await expect(callout).toBeHidden();
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
  await expect(callout).toBeVisible();
  await page.getByRole('button', { name: '初期状態へ戻す', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '初期状態へ戻す', exact: true }).click();
  await expect(callout).toBeHidden();
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await openMission(page, 'idor');
  await expect(callout).toBeHidden();
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
    await expect(page.locator('.result-callout')).toContainText('防御できました', { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioCreated') as number)).toBe(enabled ? 1 : 0);
    await expect(ticketSeals(page)).toContainText('防御：達成');
    if (enabled) {
      await expect.poll(() => page.evaluate(() => Reflect.get(window, 'audioGains') as number[])).toContain(0.06);
      await settingsButton(page).click();
      await expect(page.getByRole('slider', { name: '音量' })).toHaveValue('0.3');
      await page.getByRole('checkbox', { name: '効果音を鳴らす' }).uncheck();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
      await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
      await expect(page.locator('.result-callout')).toBeVisible();
      expect(await page.evaluate(() => Reflect.get(window, 'audioGains') as number[])).toHaveLength(2);
    }
  });
}
