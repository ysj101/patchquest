import type { MissionPack, Step, TestCase } from '../../platform/contract';
import type { CatalogApp } from '../../platform/orchestrator/orchestrator';

const requestSteps = (steps: Step[]) => steps.every((s) => s.kind === 'request');

/** 描画を含まないテストだけを取り出す。Node の実行環境は画面を描画できないため（描画を含むテストは E2E で確かめる） */
export const requestOnly = (tests: TestCase[]): TestCase[] => tests.filter((t) => requestSteps(t.steps));

/**
 * 教材アプリとパックを、Node で検証できる形にする。描画を含むテストと probe を除き、
 * 攻撃阻止のテスト（target）とレシピの probe も残ったものだけにする。除いた分はブラウザの出荷前検証で確かめる
 */
export function forNode<A extends CatalogApp>(app: A, pack: MissionPack): { app: A; pack: MissionPack } {
  const tests = requestOnly(app.tests);
  const cases = requestOnly(pack.manifest.tests.cases);
  const testIds = new Set([...tests, ...cases].map((test) => test.id));
  const probes = pack.manifest.probes.filter((probe) => requestSteps(probe.steps));
  const probeIds = new Set(probes.map((probe) => probe.id));
  const manifest = {
    ...pack.manifest,
    probes,
    mutationRecipes: pack.manifest.mutationRecipes.map((recipe) => ({ ...recipe, verify: { probes: recipe.verify.probes.filter((id) => probeIds.has(id)) } })),
    tests: { target: pack.manifest.tests.target.filter((id) => testIds.has(id)), cases },
  };
  return { app: { ...app, tests }, pack: { ...pack, manifest } };
}
