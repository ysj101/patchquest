// IDOR の E2E で共用する操作。画面の「前のメモ」で再現し、所有者の照合で合格し、理解確認に答える
import type { Page } from '@playwright/test';
import { expect, expectCalloutMatchesVerdict, preview, ticketSeals as seals, verifyResults as results, verifyWith } from '../../../tests/e2e/fixtures';

/** bob の非公開メモを開き、「前のメモ」で bob のもう 1 つのメモ（一つ前の番号）へ移る */
export async function openBobsFirstMemo(page: Page): Promise<void> {
  const app = preview(page);
  await app.getByRole('button', { name: '非公開のメモ' }).click();
  await expect(app.getByText('（bob）')).toBeVisible();
  await app.getByRole('button', { name: '← 前のメモ' }).click();
  await expect(app.getByRole('button', { name: '次のメモ →' })).toBeVisible();
}

/** bob に切り替え、bob の最初のメモの「前のメモ」で番号が隣の alice の非公開メモを開いて再現する */
export async function reproduceByPreviousMemo(page: Page): Promise<void> {
  const app = preview(page);
  await page.getByRole('radio', { name: /^bob/ }).check();
  await expect(app.getByText('bob さんとしてログイン中')).toBeVisible();
  await openBobsFirstMemo(page);
  await app.getByRole('button', { name: '← 前のメモ' }).click();
  await expect(app.getByText('（alice）')).toBeVisible();
  await expect(seals(page)).toContainText('再現：達成');
}

/** 所有者を照合する対策で検証し、防御の達成印を得る（A07） */
export async function secureByOwnerCheck(page: Page): Promise<void> {
  await verifyWith(page, '取り出す処理で、ログイン中の利用者と所有者を照合する');
  await expectCalloutMatchesVerdict(page);
  await expect(results(page)).toContainText('防御できました', { timeout: 15_000 });
  await expect(seals(page)).toContainText('防御：達成');
}

/** 理解確認の正解の選択肢（設問 ID → ラベル）。出ている設問だけに答える */
export const CORRECT_CHOICES: Record<string, string> = {
  'invoice-cause': '請求書を取り出す処理が、要求した会社がその請求書の持ち主かを確かめていない',
  'comment-edit-defense': '編集する処理で、セッションの利用者とコメントの投稿者を照合する',
};

/** 振り返りを開き、表示されている設問すべてに正解して理解の達成印を得る。答えた設問 ID を返す */
export async function answerTransferCheck(page: Page): Promise<string[]> {
  await page.getByRole('tab', { name: '振り返り' }).click();
  const questions = page.locator('.transfer .question');
  const asked = await questions.evaluateAll((items) => items.map((item) => item.querySelector('input[type=radio]')?.getAttribute('name') ?? ''));
  for (const id of asked) {
    const label = CORRECT_CHOICES[id];
    if (!label) throw new Error(`設問 ${id} の正解が分かりません`);
    await page.getByRole('radio', { name: label }).check();
  }
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(seals(page)).toContainText('理解：達成');
  return asked;
}
