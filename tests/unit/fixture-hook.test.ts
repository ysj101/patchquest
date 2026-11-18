// 初期データ生成器がフックを呼べること（注入された実装で初期データ自体が変わる）を確かめる。
import { expect, it } from 'vitest';
import type { PrepareOptions } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';

const options = (implementations: Record<string, string>): PrepareOptions => ({
  attemptId: 'fixture-hook',
  app: { id: 'test-app', version: '1.0.0' },
  fixture: { generator: 'test.provisioned', seed: 1 },
  implementations,
});

it('生成器は基準実装のフックを呼び、その結果が初期データになる', async () => {
  const engine = new AppEngine();
  const data = await engine.prepare(options({}));
  expect(data.refs['config.access']).toBe('owner');
});

it('レシピがフックの実装を注入すると、生成器の作る初期データが変わる', async () => {
  const engine = new AppEngine();
  const data = await engine.prepare(options({ 'note.provision': 'test-app/provision-everyone' }));
  expect(data.refs['config.access']).toBe('everyone');
  // 初期データが変わるので、同じ seed でもハッシュが変わる
  const baseline = await new AppEngine().prepare(options({}));
  expect(data.hash).not.toBe(baseline.hash);
});
