// 実装の選択と検証対象を組み立てる。Orchestrator とパック出荷前検証で共有する
import type { ImplementationChange, ImplementationSelection, MissionPack } from '../contract';
import type { EvaluationSubject } from '../evaluator/evaluator';
import type { CatalogApp } from './orchestrator';

/** レシピや対策の apply を実装の選択に重ねる */
export function withChanges(base: ImplementationSelection, changes: readonly ImplementationChange[]): ImplementationSelection {
  return { ...base, ...Object.fromEntries(changes.map((c) => [c.hook, c.implementation])) };
}

export function buildSubject(
  app: CatalogApp,
  pack: MissionPack,
  attemptId: string,
  seed: number,
  implementations: ImplementationSelection,
): EvaluationSubject {
  return {
    attemptId,
    app: { id: app.descriptor.id, version: app.descriptor.version },
    fixture: { generator: pack.manifest.fixtures.generator, seed },
    implementations,
  };
}
