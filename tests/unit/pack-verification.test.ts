// 同梱するすべてのパックの出荷前検証を、Node でも複数の seed で確かめる（spec §15）。パックの開発用の検証データにある
// 検証専用の対策候補（誤った修正など）も確かめる。Node では画面を描画できないため、描画を含むテストと probe は除く（それらはブラウザの verify:packs で確かめる）
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack } from '../../platform/orchestrator/pack-verification';
import { verificationCandidates } from '../support/catalog';
import { EngineRuntime } from '../support/engine-runtime';
import { forNode } from '../support/request-only';

describe.each(catalog.packs.map((pack) => [pack.manifest.id, pack] as const))('%s の出荷前検証', (_, bundled) => {
  it.each(VERIFICATION_SEEDS)('seed %i で、基準は全件合格・レシピは対象のテストだけが失敗・対策は期待どおりになる', async (seed) => {
    const app = compatibleApp(catalog.apps, bundled);
    if (!app) throw new Error(`${bundled.manifest.id} に対応する教材アプリがない`);
    const node = forNode(app, bundled);
    const evaluator = new Evaluator(() => new EngineRuntime());
    const result = await verifyPack(node.pack, node.app, evaluator, seed, verificationCandidates(bundled.manifest.id), { partial: true });
    await evaluator.dispose();
    expect(result.checks.filter((check) => !check.ok)).toEqual([]);
  });
});
