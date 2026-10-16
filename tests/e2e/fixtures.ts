// E2E の通信制限と、演習の共通操作を提供する
import { test as base, expect, type Locator, type Page } from '@playwright/test';

// すべてのE2Eテストで、localhost以外への通信を遮断し、発生したら失敗にする（spec §12, A19）
export const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const external: string[] = [];
      await context.route(
        (url) => url.origin !== origin && !['data:', 'blob:'].includes(url.protocol),
        (route) => {
          external.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      await use(external);
      expect(external, 'localhost以外への通信が発生した').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** 演出設定を開くボタン */
export const settingsButton = (page: Page) => page.getByRole('button', { name: '設定', exact: true });

/** 演習画面の教材アプリ（隔離 iframe） */
export const preview = (page: Page) => page.frameLocator('.preview-slot iframe');
/** 検証結果のパネル */
export const verifyResults = (page: Page) => page.locator('[data-anchor="results"]');
/** 演習票の達成印 */
export const ticketSeals = (page: Page) => page.locator('.ticket').getByRole('list', { name: '達成印' });

/** 導入を閉じてミッションを始めるボタン */
export const launchButton = (page: Page) => page.getByRole('button', { name: 'ミッション開始', exact: true });

/**
 * トップページ（課題一覧）を開き、描画の完了まで待つ。
 * 課題一覧は保存領域（IndexedDB）を開いてから描画されるため、負荷の高い環境では最初の表示が expect の既定の 5 秒を超えることがある。
 * 見出し（描画後にフォーカスが移る）を長めの上限で待ち、以降の操作や expect を既定の上限で行えるようにする
 */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'わざと壊したアプリで、こわして、なおして、たしかめる。' })).toBeVisible({ timeout: 15_000 });
}

/** 課題一覧のカードから新規・再挑戦・再開を選び、開始前チェックを終えて演習画面を開く */
export async function openMission(page: Page, missionId: string, options: { resume?: boolean } = {}): Promise<void> {
  const name = options.resume ? '続きから始める' : /この課題を始める|最初から始める/;
  await page.locator(`[data-mission="${missionId}"]`).getByRole('button', { name }).click();
  await beginExercise(page);
}

/** 課題一覧から課題を始め、導入を閉じて作業台に入る */
export async function startMission(page: Page, missionId: string): Promise<void> {
  await openHome(page);
  await openMission(page, missionId);
  await finishBriefing(page);
}

/** 開始前チェック後、初回の導入があれば閉じて作業台に入る */
export async function enterWorkbench(page: Page): Promise<void> {
  await beginExercise(page);
  await finishBriefing(page);
}

/** 作業台の状況タブが見え、導入が閉じてタイトルへフォーカスが移ったことを確かめる */
export async function expectWorkbench(page: Page): Promise<void> {
  await expect(page.locator('[data-anchor="briefing"]')).toBeHidden();
  await expect(page.getByRole('tab', { name: '状況' })).toBeVisible();
  await expect(page.locator('#exercise-title')).toBeFocused();
}

async function beginExercise(page: Page): Promise<void> {
  await page.getByRole('button', { name: '演習を始める' }).click({ timeout: 15_000 });
  await expect(page.locator('.exercise')).toBeVisible();
}

async function finishBriefing(page: Page): Promise<void> {
  const launch = launchButton(page);
  if (await launch.isVisible()) await launch.click();
  await expectWorkbench(page);
}

/** 対策パネルで対策を選んで適用し、検証を始める */
export async function verifyWith(page: Page, defense: string): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: new RegExp(defense) }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(page.getByText(`適用中の対策：${defense}`)).toBeVisible();
  await page.getByRole('button', { name: '攻撃と普段の使い方を検証する' }).click();
}

/** Tab キーだけで、指定した名前または Locator の要素までフォーカスを移す */
export async function tabTo(page: Page, name: string | RegExp | Locator, max = 40): Promise<void> {
  for (let index = 0; index < max; index++) {
    await page.keyboard.press('Tab');
    if (typeof name === 'object' && !(name instanceof RegExp)) {
      if (await name.evaluate((element) => element === document.activeElement)) return;
      continue;
    }
    const text = await page.evaluate(() => document.activeElement?.textContent.trim() ?? '');
    if (typeof name === 'string' ? text === name : name.test(text)) return;
  }
  throw new Error(`${String(name)} までフォーカスを移せませんでした`);
}

/** 直近の検証総評と、コールアウトの種類・文言・防御の達成印が一致することを確かめる */
export async function expectCalloutMatchesVerdict(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '攻撃と普段の使い方を検証する' })).toBeEnabled({ timeout: 20_000 });
  const verdict = verifyResults(page).locator('.banner .status');
  await expect(verdict).toHaveText(/防御できました|まだ合格ではありません/, { timeout: 20_000 });
  const secured = (await verdict.innerText()).includes('防御できました');
  const callout = page.locator('.result-callout');
  await expect(callout).toBeVisible();
  await expect(callout).toHaveAttribute('data-result', secured ? 'secured' : 'insufficient');
  await expect(callout).toContainText(secured ? '防御できました' : 'まだ合格ではありません');
  await expect(ticketSeals(page)).toContainText(secured ? '防御：達成' : '防御：未達成');
}

/** 設定ボタンにあるフォーカスから、キーボードだけで動きをオフにして閉じる */
export async function turnMotionOffWithKeyboard(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'OS の設定に従う' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'オフ', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(settingsButton(page)).toBeFocused();
}

/** test-pack の理解確認の正解（設問 ID → 選択肢のラベル） */
export const TEST_PACK_ANSWERS: Record<string, string> = { q1: '取得時に所有者を照合する' };

/**
 * 振り返りを開き、表示されている設問すべてに正解して理解の達成印を得る。
 * correct は設問 ID → 正解のラベル。出ていない設問には答えず、正解の分からない設問が出たら止める。答えた設問 ID を返す
 */
export async function answerTransferCheck(page: Page, correct: Record<string, string>): Promise<string[]> {
  await page.getByRole('tab', { name: '振り返り' }).click();
  const asked = await page.locator('.transfer .question').evaluateAll((items) => items.map((item) => item.querySelector('input[type=radio]')?.getAttribute('name') ?? ''));
  for (const id of asked) {
    const label = correct[id];
    if (!label) throw new Error(`設問 ${id} の正解が分かりません`);
    await page.getByRole('radio', { name: label, exact: true }).check();
  }
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(ticketSeals(page)).toContainText('理解：達成');
  return asked;
}

/** alice の一覧応答からノート ID を取得し、bob で読んで再現の検印を得る。 */
export async function reproduceNoteLeak(page: Page): Promise<void> {
  const entry = page.locator('.log-entry').filter({ hasText: 'alice → GET /notes' }).first();
  await entry.locator('summary').click();
  const text = await entry.locator('.log-block').nth(1).locator('pre').textContent();
  if (!text) throw new Error('調査ログがありません');
  const response = JSON.parse(text) as { notes: { id: number }[] };
  const note = response.notes[0];
  if (!note) throw new Error('ノートがありません');
  const id = note.id;
  await page.getByRole('radio', { name: 'bob' }).check();
  await page.getByLabel('ノート ID').fill(String(id));
  await page.getByRole('button', { name: '送る', exact: true }).click();
  await expect(ticketSeals(page)).toContainText('再現：達成');
}
