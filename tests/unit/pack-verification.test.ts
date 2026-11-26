// 同梱するすべてのパックの出荷前検証を、Node でも複数の seed で確かめる（spec §15）。パックの開発用の検証データにある
// 検証専用の対策候補（誤った修正など）も確かめる。Node では画面を描画できないため、描画を含むテストと probe は除く（それらはブラウザの verify:packs で確かめる）
import { describe, expect, it } from 'vitest';
import { catalog } from '../../catalog';
import { usesMachine, type MissionPack } from '../../platform/contract';
import { compatibleApp } from '../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack } from '../../platform/orchestrator/pack-verification';
import { verificationCandidates } from '../support/catalog';
import { machineEvaluator, nodeEvaluator } from '../support/engine-runtime';
import { forNode } from '../support/request-only';

/**
 * 本物の Linux を動かすパック（linux-vm）は、1 つの seed の検証に数十秒かかる。Node では最初の seed だけを確かめ、
 * 残りの seed はブラウザの verify:packs で確かめる
 */
const seedsFor = (pack: MissionPack): readonly number[] => (usesMachine(pack.manifest.runtime.capabilities) ? VERIFICATION_SEEDS.slice(0, 1) : VERIFICATION_SEEDS);
const TIMEOUT_MS = 600_000;

describe.each(catalog.packs.map((pack) => [pack.manifest.id, pack] as const))('%s の出荷前検証', (_, bundled) => {
  it.each(seedsFor(bundled))('seed %i で、基準は全件合格・レシピは対象のテストだけが失敗・対策は期待どおりになる', { timeout: TIMEOUT_MS }, async (seed) => {
    const app = compatibleApp(catalog.apps, bundled);
    if (!app) throw new Error(`${bundled.manifest.id} に対応する教材アプリがない`);
    const node = forNode(app, bundled);
    const evaluator = usesMachine(bundled.manifest.runtime.capabilities) ? machineEvaluator() : nodeEvaluator();
    const result = await verifyPack(node.pack, node.app, evaluator, seed, verificationCandidates(bundled.manifest.id), { partial: true });
    await evaluator.dispose();
    expect(result.checks.filter((check) => !check.ok)).toEqual([]);
  });
});
