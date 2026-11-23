// 擬似シェルの土台で、操作で直す課題が端から端まで成り立つことを確かめる。過剰な許可の注入・本人の操作による再現・
// 端末の操作の記録・検証前の再生・絞りすぎの検出（spec A04・A05・A14・A21）
import { describe, expect, it } from 'vitest';
import { shellApp } from '../../apps/shell';
import type { AppRequest, MissionPack } from '../../platform/contract';
import { DEFAULT_EVALUATOR_LIMITS, Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator, validateForApp } from '../../platform/orchestrator/orchestrator';
import { VERIFICATION_SEEDS, verifyPack } from '../../platform/orchestrator/pack-verification';
import { verificationCandidates } from '../support/catalog';
import { EngineRuntime } from '../support/engine-runtime';
import { shellTestPack } from '../support/shell-pack';
import { visudoSave } from '../../apps/shell/scenario';
import { describeExchange, describeExpectation, describeRequest } from '../../apps/shell/events';

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
    // 学習UIと同じく、期待と実測を擬似シェルの言葉で示す
    evaluator: new Evaluator(() => new EngineRuntime(), DEFAULT_EVALUATOR_LIMITS, () => ({ request: describeRequest, expectation: describeExpectation, exchange: describeExchange })),
    randomSeed: () => 4242, newId: () => 'attempt-1', now: () => new Date('2026-10-12T00:00:00Z'),
  });
  const snapshot = await orchestrator.start('shell-test-pack');
  expect(snapshot.attempt.state).toBe('Prepared');

  /** 演習用の機械でコマンド行を実行する */
  function type(actor: string, line: string, cwd?: string) {
    return send(actor, { method: 'POST', path: '/sh', body: { line, ...(cwd !== undefined && { cwd }) } });
  }

  /** 演習用の機械へ要求を送り、観測したやり取りを進行へ渡す（プレビューの端末と同じ経路） */
  async function send(actor: string, request: AppRequest) {
    const runId = orchestrator.newRunId();
    const { session } = await exercise.invoke({ kind: 'session', actor });
    const { response, events } = await exercise.invoke({ kind: 'request', session: session ?? null, request });
    const reproduced = await orchestrator.onExchange({ runId, actor, kind: 'request', request, response, events });
    return { reproduced, body: response?.body as { exit: number; stderr: string; cwd: string } };
  }
  /** visudo の編集画面で、運用担当向けの設定の 1 行をコメントに書き換えて保存する */
  const commentOut = (actor: string, line: number, file = OPERATORS, cwd?: string) => send(actor, visudoSave(file, [{ line, text: '# 外した' }], cwd));
  return { orchestrator, snapshot, type, commentOut };
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
    const { orchestrator, snapshot, type, commentOut } = await setup();
    // 断られた操作（運用担当による書き換え）と、開いただけの操作は、状態を変えていないので記録しない
    await commentOut('operator', 3);
    await type('admin', `sudo visudo -f ${OPERATORS}`);
    expect(snapshot.attempt.repairLog).toEqual([]);

    await commentOut('admin', 3);
    expect(snapshot.attempt.repairLog).toEqual([{ as: 'admin', request: visudoSave(OPERATORS, [{ line: 3, text: '# 外した' }]) }]);
    expect(snapshot.attempt.state).toBe('Repairing');

    const report = await orchestrator.verify();
    expect(report?.outcomes.filter((outcome) => !outcome.passed)).toEqual([]);
    // 期待と実測は、HTTP の形（POST /sh・status 200）ではなく、コマンド行と終了コードで示す
    const maintenance = String(snapshot.refs['programs.maintenance.path']);
    expect(report?.outcomes.find((outcome) => outcome.testId === 'shell.maintenance-denied')).toMatchObject({ expected: `operator が $ sudo ${maintenance} → 終了コード 0 以外`, actual: '終了コード 1' });
    expect(report?.outcomes.find((outcome) => outcome.testId === 'shell.whoami')).toMatchObject({ expected: 'operator が $ whoami → 終了コード 0', actual: '終了コード 0' });
    expect(snapshot.attempt.badges.defense.achieved).toBe(true);
    // 演習用の機械でも、同じ操作が拒否されるようになっている
    expect((await type('operator', `sudo ${snapshot.refs['programs.maintenance.path']}`)).body.exit).toBe(1);
  });

  it('検証の間に届いた修正の操作は記録に残すが、確かめたのは前の構成なので、現在の合格にはしない', async () => {
    const { orchestrator, snapshot, commentOut } = await setup();
    await commentOut('admin', 3);
    const verifying = orchestrator.verify();
    expect(snapshot.attempt.state).toBe('Verifying');
    await commentOut('admin', 2);
    expect(snapshot.attempt.repairLog).toHaveLength(2);
    const report = await verifying;
    expect(report?.passed).toBe(true);
    expect(report?.configHash).not.toBe(snapshot.attempt.configHash);
    expect(snapshot).toMatchObject({ defenseCurrent: false, attempt: { state: 'Repairing' } });
  });

  it('移動してから相対パスで直しても、記録に場所が残るので再生で同じファイルを直せる', async () => {
    const { orchestrator, snapshot, type, commentOut } = await setup();
    const { body } = await type('admin', 'cd /etc/sudoers.d');
    await commentOut('admin', 3, 'operators', body.cwd);
    expect(snapshot.attempt.repairLog).toHaveLength(1);
    expect((await orchestrator.verify())?.passed).toBe(true);
  });

  it('絞りすぎて日常の運用操作まで止めると、正常系の失敗で合格しない', async () => {
    const { orchestrator, snapshot, commentOut } = await setup();
    await commentOut('admin', 2);
    await commentOut('admin', 3);
    const report = await orchestrator.verify();
    expect(report?.passed).toBe(false);
    const failed = report?.outcomes.filter((outcome) => !outcome.passed) ?? [];
    expect(failed.map((outcome) => `${outcome.testId}(${outcome.group})`)).toEqual(['shell.operation-allowed(normal)']);
    // 不合格の実測も、終了コードを先に示す
    expect(failed[0]).toMatchObject({ expected: `operator が $ sudo ${String(snapshot.refs['programs.operation.path'])} → 終了コード 0` });
    expect(failed[0]?.actual).toMatch(/^終了コード 1：exit が ＝ 0 ではない（実際は 1）/);
    expect(snapshot.attempt.badges.defense.achieved).toBe(false);
  });

  it('最初の状態に戻すと記録が消え、機械も過剰な許可のある状態へ戻る', async () => {
    const { orchestrator, snapshot, type, commentOut } = await setup();
    await commentOut('admin', 3);
    await orchestrator.resetToInitial();
    expect(snapshot.attempt.repairLog).toEqual([]);
    expect((await type('operator', `sudo ${snapshot.refs['programs.maintenance.path']}`)).body.exit).toBe(0);
  });
});
