// 調べ方・操作のしかたのカード（platform/ui/approach-deck.ts）。カードを持つ検証用の端末パックで、1 枚ずつ出ること・送り方・全体の流れを確かめる
import { expect, readApproachCards, startMission, terminalInput, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await startMission(page, 'shell-test-pack');
  await expect(terminalInput(page)).toBeVisible();
});

test('調べ方と操作のしかたは、カードを 1 枚ずつ出し、「全体の流れ」からどのカードへも移れる', async ({ page }) => {
  await page.getByRole('tab', { name: '調査' }).click();
  const approach = page.getByRole('region', { name: '調べ方' });
  const shown = approach.locator('.approach-card:visible');
  const back = approach.getByRole('button', { name: '戻る' });
  const next = approach.getByRole('button', { name: '次へ' });
  // 最初は 1 枚目だけ。見出し・打つコマンド・見るところが出て、戻れない
  await expect(shown).toHaveCount(1);
  await expect(shown.getByRole('heading')).toHaveText('運用メモを読む');
  await expect(shown.locator('.approach-commands code')).toHaveText(['cat runbook.txt']);
  await expect(approach.locator('.approach-count')).toHaveText('1 / 3');
  await expect(back).toBeDisabled();

  // 「次へ」で送ると、そのカードで初めて出てくる道具の意味が、そのカードにだけ出る
  await next.click();
  await expect(shown.getByRole('heading')).toHaveText('許可の一覧を見る');
  await expect(shown.locator('.approach-note')).toHaveText('sudo -l は、sudo で動かせるコマンドを表示する');
  await expect(shown.locator('code')).toHaveText(['sudo -l', '(root) NOPASSWD: パス', 'sudo -l']);
  await expect(approach.locator('.approach-count')).toHaveText('2 / 3');

  // 最後のカードでは進めない。キーボードで送っていても、フォーカスは使えるボタンに残る
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(shown.getByRole('heading')).toHaveText('見くらべる');
  await expect(next).toBeDisabled();
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(shown.getByRole('heading')).toHaveText('許可の一覧を見る');

  // 「全体の流れ」は見出しだけの一覧。いまのカードに印が付き、選んだカードへ移る
  const toggle = approach.getByRole('button', { name: '全体の流れ' });
  await toggle.click();
  await expect(shown).toHaveCount(0);
  const flow = approach.getByRole('list', { name: '調べ方の全体の流れ' });
  await expect(flow.getByRole('button')).toHaveText(['運用メモを読む', '許可の一覧を見る', '見くらべる']);
  await expect(flow.locator('[aria-current="step"]')).toHaveText('許可の一覧を見る');
  await expect(next).toBeHidden();
  await flow.getByRole('button', { name: '運用メモを読む' }).click();
  await expect(shown.getByRole('heading')).toHaveText('運用メモを読む');
  await expect(flow).toBeHidden();
  await expect(toggle).toBeFocused();
  // 一覧を開いて、選ばずに戻ることもできる
  await toggle.click();
  await approach.getByRole('button', { name: '手順に戻る' }).click();
  await expect(shown.getByRole('heading')).toHaveText('運用メモを読む');

  // 対策タブの操作のしかたも同じ形。1 枚だけなら、どちらへも送れない
  await page.getByRole('tab', { name: '対策' }).click();
  const guide = page.getByRole('region', { name: '操作のしかた' });
  expect(await readApproachCards(guide)).toEqual([{ title: '設定ファイルを探す', codes: ['sudo ls /etc/sudoers.d'] }]);
  await expect(guide.getByRole('button', { name: '戻る' })).toBeDisabled();
});
