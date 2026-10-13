// ミッション1「非公開メモを守る」（IDOR、Issue #17）の固有のテスト。出荷前検証（全 seed・対策の期待・誤った修正）は
// 共通の検証（tests/unit/pack-verification.test.ts・verify:packs）が確かめるので、ここではそれより細かい期待だけを確かめる。
// Node では画面を描画しないため、描画を含まないテストで確かめる
import { describe, expect, it } from 'vitest';
import { memoApp } from '../../../apps/memo';
import type { PickNeighbors } from '../../../apps/memo/hooks';
import { idorPack } from '..';
import type { Exchange, ImplementationSelection } from '../../../platform/contract';
import { Evaluator, detectReproduction } from '../../../platform/evaluator/evaluator';
import type { CatalogApp } from '../../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS } from '../../../platform/orchestrator/pack-verification';
import { buildSubject, withChanges } from '../../../platform/orchestrator/subject';
import { EngineRuntime } from '../../../tests/support/engine-runtime';
import { requestOnly } from '../../../tests/support/request-only';
import { ALICE_PRIVATE_ID_SEED_1 } from './verification';

const app: CatalogApp = { ...memoApp, tests: requestOnly(memoApp.tests) };
const { manifest } = idorPack;
const [recipe] = manifest.mutationRecipes;
if (!recipe) throw new Error('IDOR パックに注入レシピがない');
const vulnerable = withChanges({}, recipe.apply);

function defense(id: string): ImplementationSelection {
  const found = manifest.defenses.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`対策 ${id} がない`);
  return withChanges(vulnerable, found.apply);
}

async function runSuite(implementations: ImplementationSelection, seed: number) {
  const evaluator = new Evaluator(() => new EngineRuntime());
  const subject = buildSubject(app, idorPack, `idor-${seed}`, seed, implementations);
  const report = await evaluator.runSuite(subject, [...app.tests, ...manifest.tests.cases], manifest.tests.target, `idor-${seed}`, '');
  await evaluator.dispose();
  return report.outcomes.filter((outcome) => !outcome.passed);
}

describe.each(VERIFICATION_SEEDS)('IDOR パック（seed %i）', (seed) => {
  it('画面のリンクだけを隠しても、別の利用者が ID 指定でメモを直接取得できて不合格になる（A06）', async () => {
    const failed = await runSuite(defense('hide-links'), seed);
    const direct = failed.find((outcome) => outcome.testId === 'memo.read.other-denied');
    expect(direct?.group).toBe('attack');
    expect(direct?.actual).toContain('実測 200');
    expect(failed.every((outcome) => outcome.group === 'attack')).toBe(true);
  });

  it('すべての取得を断ると、所有者の閲覧が失敗して合格しない（A05）', async () => {
    const failed = await runSuite(defense('deny-all'), seed);
    expect(failed.map((outcome) => outcome.testId)).toEqual(expect.arrayContaining(['memo.read-own', 'idor.read-own.all-users']));
  });
});

describe('ハードコードした修正の検出', () => {
  it('seed 1 の alice のメモ ID だけを守る修正は、alice のメモだけを見るテストを通ってしまう。別の利用者の組み合わせと別の seed で見つかる', async () => {
    const refs = (await new EngineRuntime().prepare(buildSubject(app, idorPack, 'refs', 1, {}))).refs;
    expect(refs['memos.alice.private.id']).toBe(ALICE_PRIVATE_ID_SEED_1);

    const fixedId = { ...vulnerable, 'memo.read.authorize': 'idor/wrong-fix-fixed-id' };
    const onSeed1 = (await runSuite(fixedId, 1)).map((outcome) => outcome.testId);
    expect(onSeed1).not.toContain('memo.read.other-denied');
    expect(onSeed1).toContain('idor.read.cross-users');
    expect((await runSuite(fixedId, 42)).map((outcome) => outcome.testId)).toContain('memo.read.other-denied');
  });
});

describe('再現の判定', () => {
  const refs = { 'users.alice.id': 602, 'users.bob.id': 618, 'users.carol.id': 648 };
  const read = (actor: string, ownerId: number, status = 200): Exchange => ({
    runId: 'r1',
    actor,
    kind: 'request',
    request: { method: 'GET', path: '/api/memos/8748' },
    response: { status, body: { memo: { id: 8748, ownerId, title: '非公開のメモ', body: '秘密' } } },
    events: [],
  });

  it('別の利用者のメモを受け取ったら、その所有者の probe で再現とみなす', () => {
    expect(detectReproduction(read('bob', 602), manifest.probes, refs)).toBe('read-alice-memo');
    expect(detectReproduction(read('alice', 618), manifest.probes, refs)).toBe('read-bob-memo');
    expect(detectReproduction(read('bob', 648), manifest.probes, refs)).toBe('read-carol-memo');
  });

  it('自分のメモの取得や、断られた要求は再現にしない', () => {
    expect(detectReproduction(read('alice', 602), manifest.probes, refs)).toBeNull();
    expect(detectReproduction(read('bob', 602, 403), manifest.probes, refs)).toBeNull();
  });
});

describe('注入する前後のメモの移動先', () => {
  it('番号の隣を選ぶ（他人のメモも含む）', () => {
    const pick = idorPack.implementations['idor/neighbors-by-number']?.run as PickNeighbors;
    expect(pick({ id: 20, ownIds: [20] })).toEqual({ prev: 19, next: 21 });
  });
});
