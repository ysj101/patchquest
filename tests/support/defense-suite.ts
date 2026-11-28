// 課題パックの固有のユニットテストで、注入した状態に対策を重ねて、通らなかったテストを調べるための部品
import type { ImplementationSelection, MissionPack } from '../../platform/contract';
import type { CatalogApp } from '../../platform/orchestrator/orchestrator';
import { buildSubject, withChanges } from '../../platform/orchestrator/subject';
import { nodeEvaluator } from './engine-runtime';

/**
 * パックの最初のレシピを注入した状態（vulnerable）と、そこへ対策を重ねた実装の選択（defense）、
 * 実装の選択と seed でアプリ共通のテストとパックのテストを走らせ、通らなかったものを返す関数（failures）を作る
 */
export function defenseSuite(app: CatalogApp, pack: MissionPack) {
  const { manifest } = pack;
  const [recipe] = manifest.mutationRecipes;
  if (!recipe) throw new Error(`${manifest.id} パックに注入レシピがない`);
  const vulnerable = withChanges({}, recipe.apply);

  const defense = (id: string): ImplementationSelection => {
    const found = manifest.defenses.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`対策 ${id} がない`);
    return withChanges(vulnerable, found.apply);
  };

  const failures = async (implementations: ImplementationSelection, seed: number) => {
    const evaluator = nodeEvaluator();
    const runId = `${manifest.id}-${seed}`;
    const subject = buildSubject(app, pack, runId, seed, implementations);
    const report = await evaluator.runSuite(subject, [...app.tests, ...manifest.tests.cases], manifest.tests.target, runId, '');
    await evaluator.dispose();
    return report.outcomes.filter((outcome) => !outcome.passed);
  };

  return { vulnerable, defense, failures };
}
