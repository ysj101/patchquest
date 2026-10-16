// 学習UI：アプリシェル・ミッション一覧・開始前チェック（Issue #11）
import type { Page } from '@playwright/test';
import { enterWorkbench, expect, tabTo, test, openHome } from './fixtures';

const card = (page: Page, id: string) => page.locator(`[data-mission="${id}"]`);

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test('一覧は練習する脆弱性名を先に見せ、学習目標は開くまで畳んである', async ({ page }) => {
  await expect(page.locator('.hero-lead')).toContainText('IDOR・保存型 XSS・SQL インジェクションの 3 つを');
  const idor = card(page, 'idor');
  await expect(idor.locator('.vulnerability-name')).toHaveText('IDOR');
  await expect(idor.locator('.vulnerability-detail')).toHaveText('安全でない直接オブジェクト参照 ・ CWE-639 ・ 認可');
  await expect(idor.getByRole('heading', { name: '非公開メモを守る' })).toBeVisible();
  await expect(idor.getByText('目安 15 分')).toBeVisible();
  await expect(idor.locator('.objectives')).toBeHidden();
  await idor.getByText('この課題でできるようになること').click();
  await expect(idor.locator('.objectives')).toBeVisible();
  // 練習課題は操作の練習なので、脆弱性名を出さない
  await expect(card(page, 'onboarding').locator('.vulnerability')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /まずは練習/ })).toBeVisible();
});

test('課題はカタログの順の推奨順路として並び、練習が START・実績が GOAL になり、どの課題もロックされない', async ({ page }) => {
  const map = page.getByRole('list', { name: 'おすすめの順路' });
  const nodes = map.locator('.map-node[data-mission]');
  await expect(nodes).toHaveCount(6);
  expect(await nodes.evaluateAll((items) => items.map((item) => item.getAttribute('data-mission')))).toEqual(['onboarding', 'idor', 'stored-xss', 'sqli', 'test-pack', 'test-broken']);
  await expect(card(page, 'onboarding').locator('.map-marker')).toHaveText('START');
  await expect(card(page, 'idor').locator('.map-marker')).toHaveText('1');
  await expect(card(page, 'sqli').locator('.map-marker')).toHaveText('3');
  // 進捗はノードごとに文字でも示す。推奨は見せ方だけで、どの課題も開始ボタンが押せる
  for (const id of ['onboarding', 'idor', 'stored-xss', 'sqli']) {
    await expect(card(page, id).locator('.map-status')).toContainText('未着手');
    await expect(card(page, id).locator('.map-status')).toContainText('ステージ 0 / 5');
    await expect(card(page, id).getByRole('button', { name: 'この課題を始める' })).toBeEnabled();
  }
  const goal = map.locator('.map-goal');
  await expect(goal.locator('.map-marker')).toHaveText('GOAL');
  await expect(goal).toContainText('すべての課題を解決');
  await expect(goal).toContainText('未解除');
  await expect(goal).toContainText('いまの称号：新人');
  // Tab 順は順路の順。START の開始ボタンの次に課題 1 の開始ボタンが来る
  await tabTo(page, card(page, 'onboarding').getByRole('button', { name: 'この課題を始める' }));
  await tabTo(page, card(page, 'idor').getByRole('button', { name: 'この課題を始める' }), 3);
});

test('キーボードだけで課題一覧から開始前チェックを経て演習を始められる', async ({ page }) => {
  await tabTo(page, 'この課題を始める');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: '開始前チェック' })).toBeVisible();
  // 点検の内容はふだん畳んである
  await expect(page.locator('.preflight-details summary')).toContainText('点検の内容');

  // 合格すると「演習を始める」にフォーカスが移る
  const begin = page.getByRole('button', { name: '演習を始める' });
  await expect(begin).toBeFocused({ timeout: 15_000 });
  await expect(page.locator('.check .status-passed')).toHaveCount(4);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'ミッション開始', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#exercise-title')).toBeFocused();
  await expect(page.getByText('学習用に脆弱性を注入した架空のサービスです。', { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '達成印' })).toContainText('再現：未達成');
});

test('攻撃が成立しない課題は開始できず、理由と次の操作を示す', async ({ page }) => {
  await card(page, 'test-broken').getByRole('button', { name: 'この課題を始める' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('開始できません（あなたの不合格には数えません）', { timeout: 15_000 });
  await expect(alert).toContainText('注入後に攻撃が成立しませんでした');
  await expect(page.locator('.check').filter({ hasText: '脆弱性の注入' }).locator('.status')).toHaveText(/不合格/);
  await page.getByRole('button', { name: 'もう一度チェックする' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'わざと壊したアプリで、こわして、なおして、たしかめる。' })).toBeVisible();
});

test('進捗を保存し、続きから始め、書き出し・読み込み・削除ができる', async ({ page }) => {
  await card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' }).click();
  await enterWorkbench(page);
  const ticket = await page.locator('.ticket-id').textContent();
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();
  // マップのノードは、導入を読んだ分だけステージが進み「途中」になる
  await expect(card(page, 'test-pack')).toHaveAttribute('data-progress', 'doing');
  await expect(card(page, 'test-pack').locator('.map-status')).toContainText('ステージ 1 / 5');

  // 続きから始めると、同じ演習票（同じ seed）で環境を作り直す
  await card(page, 'test-pack').getByRole('button', { name: '続きから始める' }).click();
  await enterWorkbench(page);
  await expect(page.locator('.ticket-id')).toHaveText(ticket!);
  await page.getByRole('button', { name: '課題一覧へ戻る' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '進捗を書き出す' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^patchquest-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(exported).toMatchObject({ format: 'patchquest-progress', attempts: [expect.objectContaining({ missionId: 'test-pack' })] });

  // 不正なファイルは拒否し、今の進捗を残す
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.getByRole('alert')).toContainText('今の進捗はそのままです');
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();

  // 削除は確認してから行う。やめるを選べば何も消えない
  await page.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.keyboard.press('Escape');
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();
  await page.getByRole('button', { name: '進捗をすべて削除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
  await expect(card(page, 'test-pack').getByRole('button', { name: 'この課題を始める' })).toBeVisible();

  // 書き出したファイルを読み込めば元に戻る
  await page.locator('input[type=file]').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(card(page, 'test-pack').getByRole('button', { name: '続きから始める' })).toBeVisible();
});

test('ブラウザに保存できないときは、書き出しを促す', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('blocked for test', 'SecurityError');
      },
    });
  });
  await page.reload();
  await expect(page.getByText(/ブラウザに保存できません.*「進捗を書き出す」で保存してください/)).toBeVisible();
});
