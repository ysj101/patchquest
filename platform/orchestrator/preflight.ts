// 互換性、基準状態、注入後の実測、演習環境の準備を順に実行する。
import { summarizeVerification, type ImplementationSelection, type VerificationReport } from '../contract';
import type { EvaluationSubject } from '../evaluator/evaluator';
import { Blocked, validateForApp, type BlockedReason, type Current, type OrchestratorDeps, type PreflightStep } from './types';

type Context = {
  current: Current;
  deps: OrchestratorDeps;
  subject: (implementations: ImplementationSelection) => EvaluationSubject;
  newRunId: () => string;
  hashFor: (implementations: ImplementationSelection) => Promise<string>;
};

function compatibility({ current, deps }: Context): string {
  const { app, snapshot } = current;
  const { attempt, pack } = snapshot;
  const { appId, versions } = pack.manifest.appCompatibility;
  if (!app) throw new Blocked({ kind: 'incompatible', message: `対応する教材アプリ ${appId} ${versions} がありません` });
  const errors = validateForApp(pack, app);
  const missing = pack.manifest.runtime.capabilities.filter((capability) => !deps.exercise.capabilities.includes(capability));
  if (missing.length) errors.push(`実行環境に必要な機能がありません: ${missing.join(', ')}`);
  if (!attempt.recipeId) errors.push('開始条件（バリエーション）に対応するレシピがありません');
  if (errors.length) throw new Blocked({ kind: 'incompatible', message: errors.join('\n') });
  return `${app.descriptor.id}@${app.descriptor.version} とパック ${pack.manifest.id}@${pack.manifest.version} は互換`;
}

async function baseline({ current, deps, subject, newRunId }: Context): Promise<string> {
  const report = await deps.evaluator.runSuite(subject({}), current.tests, [], newRunId(), '');
  const failed = report.outcomes.filter((outcome) => !outcome.passed);
  if (failed.length) throw new Blocked({ kind: 'platform-error', message: `安全な基準状態で失敗したテストがあります: ${failed.map((outcome) => outcome.title).join('、')}` });
  return `基準状態で ${report.outcomes.length} 件のテストがすべて通過`;
}

async function inject({ current, deps, subject, newRunId }: Context): Promise<string> {
  const { snapshot, vulnerable, tests } = current;
  const { attempt, pack } = snapshot;
  const recipe = pack.manifest.mutationRecipes.find((candidate) => candidate.id === attempt.recipeId);
  if (!recipe) throw new Error('開始条件に対応するレシピがありません');
  const hooks = recipe.apply.map((change) => change.hook);
  if (new Set(hooks).size !== hooks.length) throw new Blocked({ kind: 'injection-failed', message: '同じフックへ二重に注入しようとしています' });
  const injected = subject(vulnerable);
  const probes = pack.manifest.probes.filter((probe) => recipe.verify.probes.includes(probe.id));
  const outcomes = await deps.evaluator.runProbes(injected, probes, newRunId());
  const notReached = outcomes.filter((outcome) => !outcome.succeeded);
  if (notReached.length) {
    const descriptions = notReached.map((outcome) => `${outcome.probeId}（${outcome.actual}）`).join('、');
    throw new Blocked({ kind: 'injection-failed', message: `注入後に攻撃が成立しませんでした: ${descriptions}` });
  }
  const report = await deps.evaluator.runSuite(injected, tests, pack.manifest.tests.target, newRunId(), '');
  const failure = injectionFailure(report);
  if (failure) throw new Blocked(failure);
  snapshot.vulnerableVerification = report;
  const attackCount = summarizeVerification(report).groups.attack.total;
  return `攻撃の成立を確認（${outcomes.length} 件）。攻撃阻止のテスト ${attackCount} 件は注入後に失敗し、正常系と対象外のテスト ${report.outcomes.length - attackCount} 件は通過`;
}

async function prepare({ current, deps, subject, hashFor }: Context): Promise<string> {
  const { snapshot, vulnerable } = current;
  // 事前検証で変わったデータは検証インスタンスに閉じている。演習用は同じ seed の初期状態から作る。
  const fixture = await deps.exercise.prepare(subject(vulnerable));
  await deps.exercise.start();
  snapshot.refs = fixture.refs;
  snapshot.implementations = { ...vulnerable };
  snapshot.attempt.fixtureHash = fixture.hash;
  snapshot.attempt.configHash = await hashFor(vulnerable);
  return '脆弱な初期状態を用意しました';
}

/** 表示用のステップ更新は呼び出し元が担い、失敗時は後続を実行しない。 */
export async function runPreflightSteps(context: Context, step: (name: PreflightStep, work: () => Promise<string>) => Promise<void>): Promise<void> {
  await step('compatibility', () => Promise.resolve(compatibility(context)));
  await step('baseline', () => baseline(context));
  await step('inject', () => inject(context));
  await step('prepare', () => prepare(context));
}

/** 基盤エラーを先に判定し、攻撃阻止の全件不合格と対象外の全件合格を確認する。 */
function injectionFailure(report: VerificationReport): BlockedReason | null {
  const errors = report.outcomes.filter((outcome) => outcome.error !== undefined);
  const errorTitles = errors.map((outcome) => `${outcome.title}（${outcome.error}）`).join('、');
  if (errors.length) return { kind: 'platform-error', message: `注入後のテストを判定できませんでした: ${errorTitles}` };
  const passedTargets = report.outcomes.filter((outcome) => outcome.group === 'attack' && outcome.passed);
  if (passedTargets.length) return { kind: 'injection-failed', message: `注入後も攻撃阻止のテストが通っています: ${passedTargets.map((outcome) => outcome.title).join('、')}` };
  const broken = report.outcomes.filter((outcome) => outcome.group !== 'attack' && !outcome.passed);
  if (broken.length) return { kind: 'injection-failed', message: `注入後に正常系・対象外のテストが失敗しました: ${broken.map((outcome) => outcome.title).join('、')}` };
  return null;
}
