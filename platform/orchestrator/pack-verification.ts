// パック出荷前検証（spec §15）。基準で全合格／レシピは対象テストだけが失敗し攻撃が成立／
// 対策は expected どおり（secure は全合格、insufficient は攻撃阻止が失敗、breaks-normal は正常系が失敗）
import type { DefenseDef, ImplementationSelection, MissionPack, VerificationReport } from '../contract';
import type { Evaluator } from '../evaluator/evaluator';
import type { CatalogApp } from './orchestrator';
import { buildSubject, withChanges } from './subject';

/**
 * 出荷前検証だけで確かめる対策候補。学習画面には出さない。
 * 例：特定の利用者名やメモ ID をハードコードした誤った修正が、expected どおり（insufficient）に判定されること
 */
export type VerificationCandidate = Pick<DefenseDef, 'id' | 'apply' | 'expected'>;

export interface PackCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PackVerification {
  packId: string;
  /** 検証に使った初期データの seed */
  seed: number;
  ok: boolean;
  checks: PackCheck[];
}

/**
 * 出荷前検証に使う seed。利用者名やメモ ID をハードコードしたテスト・実装を見逃さないよう、
 * 初期データ（ID・内容）が異なる複数の seed で確かめる（spec §5.4, §8.1）
 */
export const VERIFICATION_SEEDS: readonly number[] = [1, 42, 20261012];

const failedIds = (report: VerificationReport) => report.outcomes.filter((o) => !o.passed).map((o) => o.testId);

/**
 * 対策を適用した結果が expected どおりかを判定する。partial（テストの一部だけで確かめる）のとき、
 * 不十分・正常系を壊す対策で失敗が 1 つもなければ判定できない（除いたテストで失敗するかもしれない）
 */
function judgeDefense(expected: DefenseDef['expected'], report: VerificationReport, partial: boolean): Pick<PackCheck, 'ok' | 'detail'> {
  const failed = report.outcomes.filter((o) => !o.passed);
  if (partial && expected !== 'secure' && failed.length === 0) return { ok: true, detail: 'この範囲のテストでは判定できない（全テストの検証で確かめる）' };
  const ok =
    expected === 'secure'
      ? failed.length === 0
      : expected === 'insufficient'
        ? failed.some((o) => o.group === 'attack') && failed.every((o) => o.group === 'attack')
        : failed.some((o) => o.group === 'normal');
  return { ok, detail: failed.map((o) => `${o.testId}(${o.group})`).join(', ') || '全件合格' };
}
const sameSet = (a: string[], b: readonly string[]) => a.length === b.length && b.every((id) => a.includes(id));

export async function verifyPack(
  pack: MissionPack,
  app: CatalogApp,
  evaluator: Evaluator,
  seed = 1,
  /** パックの対策候補に加えて確かめる、検証専用の候補 */
  extraCandidates: readonly VerificationCandidate[] = [],
  /** partial：テストの一部だけで確かめる（Node は描画を含むテストを除く）。残りは全テストの検証で確かめる */
  { partial = false }: { partial?: boolean } = {},
): Promise<PackVerification> {
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

    for (const defense of [...manifest.defenses, ...extraCandidates]) {
      const applied = withChanges(vulnerable, defense.apply);
      const report = await run(applied, `${recipe.id}+${defense.id}`);
      checks.push({ name: `レシピ ${recipe.id} ＋ 対策 ${defense.id}：${defense.expected}`, ...judgeDefense(defense.expected, report, partial) });
    }
  }
  return { packId: manifest.id, seed, ok: checks.every((c) => c.ok), checks };
}
