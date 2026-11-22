// 製品の教材アプリの枠（隔離 iframe）の中のスクリプトが、学習UI・保存領域・外部へ届かないことを確かめる（spec §14）。
// 脆弱性を注入した教材アプリで攻撃のスクリプトが動いても、被害が枠の外へ出ないことの確認
import { expect, startMission, test } from './fixtures';

/** 枠の中で式を実行し、起きたことを返す（threw：例外、rejected：約束が失敗、returned：値が返った） */
type Outcome = { outcome: 'threw' | 'rejected' | 'returned'; detail: string };

test('教材アプリの枠の中のスクリプトは、学習UIの DOM・保存領域・外部への通信・別の画面に届かない', async ({ page }) => {
  await startMission(page, 'test-pack');
  const element = page.locator('.preview-slot iframe');
  await expect(element).toHaveAttribute('sandbox', 'allow-scripts');
  const frame = await (await element.elementHandle()).contentFrame();
  if (!frame) throw new Error('教材アプリの枠がありません');
  const hostUrl = page.url();

  const outcomes = await frame.evaluate(async () => {
    // 枠の中で動くスクリプトが試しそうな操作
    const probes: Record<string, () => unknown> = {
      'parent-dom': () => parent.document.title,
      'parent-storage': () => parent.localStorage.length,
      'own-storage': () => localStorage.length,
      cookie: () => document.cookie,
      indexeddb: () => indexedDB.open('pq'),
      fetch: () => fetch('https://example.com/pq'),
      // 別の画面が開かなかったことは、下でページの数から確かめる
      popup: () => window.open('https://example.com/', '_blank', 'noopener'),
      'top-navigation': () => (top ?? window).location.assign('https://example.com/'),
    };
    const results: Record<string, Outcome> = {};
    for (const [name, probe] of Object.entries(probes)) {
      try {
        const value = probe();
        if (value instanceof Promise) {
          results[name] = await value.then(
            (): Outcome => ({ outcome: 'returned', detail: 'resolved' }),
            (error: unknown): Outcome => ({ outcome: 'rejected', detail: error instanceof Error ? error.name : String(error) }),
          );
        } else {
          results[name] = { outcome: 'returned', detail: String(value) };
        }
      } catch (error) {
        results[name] = { outcome: 'threw', detail: error instanceof Error ? error.name : String(error) };
      }
    }
    return results;
  });

  expect(outcomes).toEqual({
    'parent-dom': { outcome: 'threw', detail: 'SecurityError' },
    'parent-storage': { outcome: 'threw', detail: 'SecurityError' },
    'own-storage': { outcome: 'threw', detail: 'SecurityError' },
    cookie: { outcome: 'threw', detail: 'SecurityError' },
    indexeddb: { outcome: 'threw', detail: 'SecurityError' },
    fetch: { outcome: 'rejected', detail: 'TypeError' },
    popup: { outcome: 'returned', detail: 'null' },
    'top-navigation': { outcome: 'threw', detail: 'SecurityError' },
  });
  // 学習UIは別の場所へ移っていない。localhost 以外への通信が起きていないことは、fixtures の externalRequests が確かめる
  expect(page.url()).toBe(hostUrl);
  expect(page.context().pages()).toHaveLength(1);
});
