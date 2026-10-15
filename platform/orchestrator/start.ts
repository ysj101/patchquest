// 演習開始時に固定する版・seed・構成と、再開時に引き継ぐ記録を組み立てる。
import { initialAttemptProgress, type AttemptRecord, type MissionPack } from '../contract';
import { compatibleApp, type Current, type OrchestratorDeps } from './types';
import { withChanges } from './subject';

type StartOptions = { variantId?: string; seed?: number; resume?: AttemptRecord };
type Sources = { newId: () => string; now: () => Date; randomSeed: () => number };

function carried(resume: AttemptRecord | undefined) {
  return resume && {
    attemptId: resume.attemptId, createdAt: resume.createdAt,
    badges: structuredClone(resume.badges), milestones: { ...resume.milestones },
    lastVerification: resume.lastVerification, history: structuredClone(resume.history),
    hintsOpened: [...resume.hintsOpened], solutionViewed: resume.solutionViewed, answers: { ...resume.answers },
  };
}

function startRecipe(pack: MissionPack, options: StartOptions) {
  const { manifest } = pack;
  const variantId = options.resume?.variantId ?? options.variantId ?? manifest.fixtures.variants[0]?.id;
  const variant = manifest.fixtures.variants.find((candidate) => candidate.id === variantId);
  const recipe = manifest.mutationRecipes.find((candidate) => candidate.id === variant?.recipe);
  return { variant, recipe };
}

function newAttempt(pack: MissionPack, app: Current['app'], options: StartOptions, sources: Sources): AttemptRecord {
  const { manifest } = pack;
  const { variant, recipe } = startRecipe(pack, options);
  return {
    attemptId: sources.newId(), missionId: manifest.id, missionVersion: manifest.version,
    variantId: variant?.id ?? '', recipeId: recipe?.id ?? '', recipeVersion: recipe?.version ?? '',
    appId: manifest.appCompatibility.appId, appVersion: app?.descriptor.version ?? '',
    seed: options.resume?.seed ?? options.seed ?? sources.randomSeed(), fixtureHash: '',
    createdAt: sources.now().toISOString(), state: 'Selected', configHash: '',
    ...initialAttemptProgress(), ...carried(options.resume),
  };
}

/** 続きから始めても検証の現在性と修正前の実測は引き継がず、事前検証で作り直す。 */
export function createCurrent(deps: OrchestratorDeps, options: StartOptions & { packId: string }, sources: Sources): Current {
  const pack = deps.packs.find((candidate) => candidate.manifest.id === options.packId);
  if (!pack) throw new Error(`課題 ${options.packId} は登録されていません`);
  const { manifest } = pack;
  const app = compatibleApp(deps.apps, pack) ?? deps.apps.find((candidate) => candidate.descriptor.id === manifest.appCompatibility.appId);
  const attempt = newAttempt(pack, app, options, sources);
  const recipe = manifest.mutationRecipes.find((candidate) => candidate.id === attempt.recipeId);
  return {
    snapshot: { attempt, pack, refs: {}, implementations: {}, preflight: [], blocked: null, platformError: null, defenseCurrent: false, vulnerableVerification: null },
    app, tests: [...(app?.tests ?? []), ...manifest.tests.cases],
    vulnerable: withChanges({}, recipe?.apply ?? []),
    baseline: Object.fromEntries(manifest.hooks.map((hook) => [hook.id, app?.descriptor.hooks.find((candidate) => candidate.id === hook.id)?.baseline ?? ''])),
    runIds: new Set(),
  };
}
