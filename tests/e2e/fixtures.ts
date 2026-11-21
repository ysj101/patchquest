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

/**
 * 演習票と開始前チェックの「課題一覧へ戻る」。
 * ヘッダーのロゴ（読み上げ名は「PatchQuest（課題一覧へ戻る）」）は含めない。
 * 演習票のボタンは、CSS の矢印が読み上げ名の先頭に入る
 */
export const backToList = (page: Page) => page.getByRole('button', { name: /^(?:← )?課題一覧へ戻る$/ });

/** 演習画面の教材アプリ（隔離 iframe） */
export const preview = (page: Page) => page.frameLocator('.preview-slot iframe');
/** 擬似シェルの端末（教材アプリの画面）の入力欄と出力 */
export const terminalInput = (page: Page) => preview(page).getByRole('textbox', { name: 'コマンド' });
export const terminalOutput = (page: Page) => preview(page).getByRole('log', { name: '端末の出力' });

/** 端末にコマンド行を入力して Enter で送る。前のコマンドの応答が返るまで入力欄は使えないので、続けて呼べる */
export async function typeCommand(page: Page, line: string): Promise<void> {
  await terminalInput(page).fill(line);
  await terminalInput(page).press('Enter');
}

/** 利用者を切り替え、その利用者の端末が開き直るのを待つ。プロンプトの利用者名が変わったら、開き直しが終わっている */
export async function loginToTerminal(page: Page, actor: string): Promise<void> {
  const prompt = preview(page).locator('.term-prompt');
  const before = await prompt.innerText();
  await page.getByRole('radio', { name: actor }).check();
  await expect(prompt).not.toHaveText(before);
  await expect(prompt).toHaveText(/^[a-z]+@/);
}

/** 端末の中に開いた編集画面（visudo） */
export const terminalEditor = (page: Page) => preview(page).getByRole('region', { name: /の編集$/ });

/**
 * 端末で visudo を開き、指定した行の先頭に # を付けてコメントにして保存する。
 * 保存が済むと編集画面が閉じ、コマンドの入力欄へ戻る
 */
export async function commentOutWithVisudo(page: Page, file: string, lines: number[]): Promise<void> {
  await typeCommand(page, `sudo visudo -f ${file}`);
  const editor = terminalEditor(page);
  for (const line of lines) {
    const row = editor.getByRole('textbox', { name: `${line} 行目`, exact: true });
    await row.fill(`# ${await row.inputValue()}`);
  }
  await editor.getByRole('button', { name: /^保存して閉じる/ }).click();
  await expect(editor).toHaveCount(0);
}

/** 対策タブの「初期状態へ戻す」を押し、確認して戻す */
export async function resetToInitial(page: Page): Promise<void> {
  await page.getByRole('button', { name: '初期状態へ戻す' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '初期状態へ戻す' }).click();
}

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
  await expect(pageHeading(page, 'PatchQuest')).toBeVisible({ timeout: 15_000 });
}

/** 検証ページ（tests/pages）の準備が終わるまで待つ。再読み込みの後にも使う */
export async function testPageReady(page: Page): Promise<void> {
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
}

/** 検証ページ（/test/<name>.html）を開き、準備が終わるまで待つ */
export async function openTestPage(page: Page, name: string): Promise<void> {
  await page.goto(`/test/${name}.html`);
  await testPageReady(page);
}

/** 以降に開くページで IndexedDB を使えなくする（保存できない環境の再現） */
export async function blockIndexedDb(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('blocked for test', 'SecurityError');
      },
    });
  });
}

/** 課題一覧の設定から進捗ファイルを読み込み、注記を確かめて閉じる */
export async function importProgressFile(page: Page, json: unknown, note: string): Promise<void> {
  await openHome(page);
  await settingsButton(page).click();
  const dialog = page.getByRole('dialog', { name: '設定' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: '進捗.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(dialog.locator('.banner-warn').filter({ hasText: note })).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
}

const pageHeading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });
const siteNav = (page: Page) => page.getByRole('navigation', { name: 'ページ' });

/** 見出しの「記録」から記録ページ（習熟度・実績）を開く */
export async function openRecords(page: Page): Promise<void> {
  await siteNav(page).getByRole('button', { name: '記録' }).click();
  await expect(pageHeading(page, '記録')).toBeVisible();
}

/** ページ移動の「課題」から課題一覧を開く。すでに一覧（見出しは PatchQuest）ならそのまま */
export async function openMissions(page: Page): Promise<void> {
  if (await pageHeading(page, 'PatchQuest').isVisible()) return;
  await siteNav(page).getByRole('button', { name: '課題' }).click();
  await expect(pageHeading(page, 'PatchQuest')).toBeVisible();
}

/** 課題一覧のカードから新規・再挑戦・再開を選び、開始前チェックを終えて演習画面を開く。記録ページにいれば一覧へ戻ってから選ぶ */
export async function openMission(page: Page, missionId: string, options: { resume?: boolean } = {}): Promise<void> {
  await openMissions(page);
  const name = options.resume ? '続きから始める' : /この課題を始める|最初から始める/;
  await page.locator(`[data-mission="${missionId}"]`).getByRole('button', { name }).click();
  await beginExercise(page);
}

/** 調査タブの生リクエスト編集欄を開く。初期状態では「上級者向け」として畳んである */
export async function openRawRequest(page: Page): Promise<void> {
  const editor = page.locator('[data-anchor="request-editor"]');
  if ((await editor.getAttribute('open')) === null) await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
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

/** 開始前チェックに合格すると、ボタンを押さずに演習画面へ進む */
async function beginExercise(page: Page): Promise<void> {
  await expect(page.locator('.exercise')).toBeVisible({ timeout: 15_000 });
}

async function finishBriefing(page: Page): Promise<void> {
  const launch = launchButton(page);
  if (await launch.isVisible()) await launch.click();
  await expectWorkbench(page);
}

/** 対策パネルで対策を選んで適用する */
export async function applyDefense(page: Page, defense: string): Promise<void> {
  await page.getByRole('tab', { name: '対策' }).click();
  await page.getByRole('radio', { name: new RegExp(defense) }).check();
  await page.getByRole('button', { name: 'この対策を適用する' }).click();
  await expect(page.getByText(`適用中の対策：${defense}`)).toBeVisible();
}

/** 対策パネルで対策を選んで適用し、検証を始める */
export async function verifyWith(page: Page, defense: string): Promise<void> {
  await applyDefense(page, defense);
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

/** キーボードで動きをオフにしてから課題を始め、導入を閉じる */
export async function startWithMotionOff(page: Page, missionId: string): Promise<void> {
  await openHome(page);
  await settingsButton(page).focus();
  await turnMotionOffWithKeyboard(page);
  await openMission(page, missionId);
  await launchButton(page).click();
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

/** alice の一覧応答からノート ID を取得し、bob で読んで再現の検印を得る。
 * 一覧は観測ログの古い方を読む。送信の直後はプレビューの描き直しが新しい一覧を上に足すため、先頭は開く途中で入れ替わる */
export async function reproduceNoteLeak(page: Page): Promise<void> {
  const entry = page.locator('.log-entry').filter({ hasText: /alice → GET \/notes(?!\/)/ }).last();
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
