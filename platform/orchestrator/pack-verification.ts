// パック出荷前検証（spec §15）。基準で全合格／レシピは対象テストだけが失敗し攻撃が成立／
// 対策は expected どおり（secure は全合格、insufficient は攻撃阻止が失敗、breaks-normal は正常系が失敗）
import type { ImplementationSelection, MissionPack, VerificationReport } from '../contract';
import type { Evaluator } from '../evaluator/evaluator';
import type { CatalogApp } from './orchestrator';
import { buildSubject, withChanges } from './subject';

export interface PackCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PackVerification {
  packId: string;
  ok: boolean;
  checks: PackCheck[];
}

const failedIds = (report: VerificationReport) => report.outcomes.filter((o) => !o.passed).map((o) => o.testId);
const sameSet = (a: string[], b: readonly string[]) => a.length === b.length && b.every((id) => a.includes(id));

export async function verifyPack(pack: MissionPack, app: CatalogApp, evaluator: Evaluator, seed = 1): Promise<PackVerification> {
  const { manifest } = pack;
  const tests = [...app.tests, ...manifest.tests.cases];
  const target = manifest.tests.target;
  const checks: PackCheck[] = [];
  const subject = (implementations: ImplementationSelection) => buildSubject(app, pack, `verify-${manifest.id}`, seed, implementations);
  const run = (implementations: ImplementationSelection, label: string) =>
    evaluator.runSuite(subject(implementations), tests, target, `verify:${manifest.id}:${label}`, '');

  const baseline = await run({}, 'baseline');
  checks.push({ name: '基準状態ですべてのテストが通る', ok: baseline.passed, detail: failedIds(baseline).join(', ') || '全件合格' });

  for (const recipe of manifest.mutationRecipes) {
    const vulnerable = withChanges({}, recipe.apply);
    const probes = await evaluator.runProbes(subject(vulnerable), manifest.probes.filter((p) => recipe.verify.probes.includes(p.id)), `verify:${manifest.id}:probe`);
    checks.push({
      name: `レシピ ${recipe.id}：攻撃が成立する`,
      ok: probes.every((p) => p.succeeded),
      detail: probes.map((p) => `${p.probeId}=${p.succeeded ? '成立' : `不成立（${p.actual}）`}`).join(', '),
    });
    const injected = await run(vulnerable, recipe.id);
    checks.push({
      name: `レシピ ${recipe.id}：対象のテストだけが失敗する`,
      ok: sameSet(failedIds(injected), target),
      detail: `失敗: ${failedIds(injected).join(', ') || 'なし'} / 期待: ${target.join(', ')}`,
    });

    for (const defense of manifest.defenses) {
      const applied = withChanges(vulnerable, defense.apply);
      const report = await run(applied, `${recipe.id}+${defense.id}`);
      const failed = report.outcomes.filter((o) => !o.passed);
      const ok =
        defense.expected === 'secure'
          ? failed.length === 0
          : defense.expected === 'insufficient'
            ? failed.some((o) => o.group === 'attack') && failed.every((o) => o.group === 'attack')
            : failed.some((o) => o.group === 'normal');
      checks.push({
        name: `レシピ ${recipe.id} ＋ 対策 ${defense.id}：${defense.expected}`,
        ok,
        detail: failed.map((o) => `${o.testId}(${o.group})`).join(', ') || '全件合格',
      });
    }
  }
  return { packId: manifest.id, ok: checks.every((c) => c.ok), checks };
}
