// 擬似シェルの土台で、操作で直す課題が端から端まで成り立つことを確かめる。過剰な許可の注入・本人の操作による再現・
// 端末の操作の記録・検証前の再生・絞りすぎの検出（spec A04・A05・A14・A21）
import { describe, expect, it } from 'vitest';
import { shellApp } from '../../apps/shell';
import type { AppRequest, MissionPack } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator, validateForApp } from '../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack } from '../../platform/orchestrator/pack-verification';
import { verificationCandidates } from '../support/catalog';
import { EngineRuntime } from '../support/engine-runtime';
import { shellTestPack } from '../support/shell-pack';

const OPERATORS = '/etc/sudoers.d/operators';

it('検証用パックは擬似シェルの契約に合う', () => {
  expect(validateForApp(shellTestPack, shellApp)).toEqual([]);
});

describe('出荷前検証', () => {
  it.each(VERIFICATION_SEEDS)('seed %i で、基準は全件合格・注入後は対象のテストだけが失敗・操作は期待どおりに判定される', async (seed) => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const result = await verifyPack(shellTestPack, shellApp, evaluator, seed, verificationCandidates('shell-test-pack'));
    await evaluator.dispose();
    expect(result.checks.filter((check) => !check.ok)).toEqual([]);
    expect(result.checks.map((check) => check.name)).toEqual(expect.arrayContaining(['レシピ excess-sudo ＋ 対策 remove-maintenance：secure', 'レシピ excess-sudo ＋ 対策 remove-everything：breaks-normal']));
  });
});

/** Node の実行環境は画面を描画しないので、必要な機能から画面を外して進行を確かめる */
const nodePack: MissionPack = { ...shellTestPack, manifest: { ...shellTestPack.manifest, runtime: { adapter: 'browser', capabilities: ['sqlite'] } } };

async function setup() {
  const exercise = new EngineRuntime();
  const orchestrator = new Orchestrator({
    apps: [shellApp], packs: [nodePack], exercise,
    evaluator: new Evaluator(() => new EngineRuntime()),
    randomSeed: () => 4242, newId: () => 'attempt-1', now: () => new Date('2026-10-12T00:00:00Z'),
  });
  const snapshot = await orchestrator.start('shell-test-pack');
  expect(snapshot.attempt.state).toBe('Prepared');

  /** 演習用の機械でコマンド行を実行し、観測したやり取りを進行へ渡す（プレビューの端末と同じ経路） */
  async function type(actor: string, line: string, cwd?: string) {
    const runId = orchestrator.newRunId();
    const request: AppRequest = { method: 'POST', path: '/sh', body: { line, ...(cwd !== undefined && { cwd }) } };
    const { session } = await exercise.invoke({ kind: 'session', actor });
    const { response, events } = await exercise.invoke({ kind: 'request', session: session ?? null, request });
    const reproduced = await orchestrator.onExchange({ runId, actor, kind: 'request', request, response, events });
    return { reproduced, body: response?.body as { exit: number; stderr: string; cwd: string } };
  }
  return { orchestrator, snapshot, type };
}

describe('操作で直す課題の進行', () => {
  it('運用担当が保守の操作を実行すると再現になり、調べるだけの操作は修正の記録にならない', async () => {
    const { snapshot, type } = await setup();
    expect((await type('operator', 'sudo -l')).reproduced).toBe(false);
    expect((await type('admin', `sudo ${snapshot.refs['programs.maintenance.path']}`)).reproduced).toBe(false);
    expect((await type('operator', `sudo ${snapshot.refs['programs.maintenance.path']}`)).reproduced).toBe(true);
    expect(snapshot.attempt.badges.reproduction.achieved).toBe(true);
    expect(snapshot.attempt.repairLog).toEqual([]);
    expect(snapshot.attempt.state).toBe('Explored');
  });

  it('過剰な許可を外す操作が記録され、検証の前に再生されて合格する', async () => {
    const { orchestrator, snapshot, type } = await setup();
    // 断られた操作（運用担当による書き換え）は、状態を変えていないので記録しない
    await type('operator', `sudo edit ${OPERATORS} 3 '# 外した'`);
    expect(snapshot.attempt.repairLog).toEqual([]);

    await type('admin', `sudo edit ${OPERATORS} 3 '# 外した'`);
    expect(snapshot.attempt.repairLog).toEqual([{ as: 'admin', request: { method: 'POST', path: '/sh', body: { line: `sudo edit ${OPERATORS} 3 '# 外した'` } } }]);
    expect(snapshot.attempt.state).toBe('Repairing');

    const report = await orchestrator.verify();
    expect(report?.outcomes.filter((outcome) => !outcome.passed)).toEqual([]);
    expect(snapshot.attempt.badges.defense.achieved).toBe(true);
    // 演習用の機械でも、同じ操作が拒否されるようになっている
    expect((await type('operator', `sudo ${snapshot.refs['programs.maintenance.path']}`)).body.exit).toBe(1);
  });

  it('移動してから相対パスで直しても、記録に場所が残るので再生で同じファイルを直せる', async () => {
    const { orchestrator, snapshot, type } = await setup();
    const { body } = await type('admin', 'cd /etc/sudoers.d');
    await type('admin', "sudo edit operators 3 '# 外した'", body.cwd);
    expect(snapshot.attempt.repairLog).toHaveLength(1);
    expect((await orchestrator.verify())?.passed).toBe(true);
  });

  it('絞りすぎて日常の運用操作まで止めると、正常系の失敗で合格しない', async () => {
    const { orchestrator, snapshot, type } = await setup();
    await type('admin', `sudo edit ${OPERATORS} 2 '# 外した'`);
    await type('admin', `sudo edit ${OPERATORS} 3 '# 外した'`);
    const report = await orchestrator.verify();
    expect(report?.passed).toBe(false);
    expect(report?.outcomes.filter((outcome) => !outcome.passed).map((outcome) => `${outcome.testId}(${outcome.group})`)).toEqual(['shell.operation-allowed(normal)']);
    expect(snapshot.attempt.badges.defense.achieved).toBe(false);
  });

  it('初期状態へ戻すと記録が消え、機械も過剰な許可のある状態へ戻る', async () => {
    const { orchestrator, snapshot, type } = await setup();
    await type('admin', `sudo edit ${OPERATORS} 3 '# 外した'`);
    await orchestrator.resetToInitial();
    expect(snapshot.attempt.repairLog).toEqual([]);
    expect((await type('operator', `sudo ${snapshot.refs['programs.maintenance.path']}`)).body.exit).toBe(0);
  });
});
