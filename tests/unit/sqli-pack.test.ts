// ミッション3「検索条件からの情報漏えいを防ぐ」（SQL インジェクション、Issue #19）。
// 検索のテストはリクエストだけなので、Node の実行環境で複数の seed の出荷前検証まで確かめる（A10・A11）
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import { sqliPack } from '../../missions/sqli';
import type { Exchange } from '../../platform/contract';
import { Evaluator, detectReproduction } from '../../platform/evaluator/evaluator';
import type { CatalogApp } from '../../platform/orchestrator/orchestrator';
import { verifyPack } from '../../platform/orchestrator/pack-verification';
import { EngineRuntime } from '../support/engine-runtime';
import { requestOnly } from '../support/request-only';

const SEEDS = [1, 42, 20261012];
const app: CatalogApp = { ...memoApp, tests: requestOnly(memoApp.tests) };

describe.each(SEEDS)('SQL インジェクションパック（seed %i）', (seed) => {
  it('出荷前検証に合格する。注入で他人のメモが返り、バインドは全合格、語の禁止は攻撃が残り、検索の停止は正常系が壊れる', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const result = await verifyPack(sqliPack, app, evaluator, seed);
    await evaluator.dispose();
    expect(result.checks.filter((check) => !check.ok)).toEqual([]);
  });
});

describe('再現の判定', () => {
  const refs = { 'users.alice.id': 602, 'users.bob.id': 618, 'users.carol.id': 648 };

  const search = (actor: string, ownerIds: number[]): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'request',
    request: { method: 'GET', path: '/api/search?q=payload' },
    response: { status: 200, body: { results: ownerIds.map((ownerId) => ({ id: ownerId, ownerId, title: '非公開のメモ' })) } },
    events: [],
  });

  it('検索した利用者の結果に、別の利用者のメモが含まれると、その利用者の probe に一致する', () => {
    expect(detectReproduction(search('alice', [602, 618]), sqliPack.manifest.probes, refs)).toBe('search-as-alice');
    expect(detectReproduction(search('bob', [618]), sqliPack.manifest.probes, refs)).toBeNull();
    expect(detectReproduction({ ...search('carol', [602]), kind: 'render' }, sqliPack.manifest.probes, refs)).toBeNull();
  });
});
