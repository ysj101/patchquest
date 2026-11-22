// 演習用の機械の配布物を読めなかったとき、その失敗を使い回さず、次の起動で読み直すことを確かめる。
import { expect, it, vi } from 'vitest';
import { Machine, type AssetLoader } from '../../runtimes/browser/machine';

it('配布物を読めなかったら、次の起動でもう一度読みに行く', async () => {
  const load = vi.fn<AssetLoader>(() => Promise.reject(new Error('読めません')));
  await expect(Machine.boot(load)).rejects.toThrow('読めません');
  const first = load.mock.calls.length;
  await expect(Machine.boot(load)).rejects.toThrow('読めません');
  expect(load.mock.calls).toHaveLength(first * 2);
});
