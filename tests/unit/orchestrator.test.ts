// Orchestrator の進行（Issue #9）。Node では画面を描画しないため、描画を含まないテストだけのパックで確かめる
import { describe, expect, it } from 'vitest';
import type { Exchange, MissionPack } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator, type CatalogApp } from '../../platform/orchestrator/orchestrator';
import { verifyPack } from '../../platform/orchestrator/pack-verification';
import { EngineRuntime } from '../support/engine-runtime';
import { testApp } from '../support/test-app';
import { testPack } from '../support/test-pack';

/** 描画の手順を含むテストを除いた、Node 用のテスト専用パック（Node の実行環境は画面を描画できない） */
const nodePack: MissionPack = {
  ...testPack,
  manifest: {
    ...testPack.manifest,
    runtime: { adapter: 'browser', capabilities: ['sqlite'] },
    hooks: testPack.manifest.hooks.filter((h) => h.id !== 'note.render'),
    tests: { ...testPack.manifest.tests, cases: testPack.manifest.tests.cases.filter((t) => t.steps.every((s) => s.kind === 'request')) },
  },
};

function withManifest(change: (m: MissionPack['manifest']) => void): MissionPack {
  const copy = structuredClone({ ...nodePack, implementations: {} }) as MissionPack;
  change(copy.manifest);
  return { ...copy, implementations: nodePack.implementations };
}

class CountingRuntime extends EngineRuntime {
  prepared = 0;
  override prepare(...args: Parameters<EngineRuntime['prepare']>) {
    this.prepared++;
    return super.prepare(...args);
  }
}

function setup(packs: MissionPack[] = [nodePack]) {
  const exercise = new CountingRuntime();
  const app: CatalogApp = testApp;
  let id = 0;
  const orchestrator = new Orchestrator({
    apps: [app],
    packs,
    evaluator: new Evaluator(() => new EngineRuntime()),
    exercise,
    randomSeed: () => 4242,
    newId: () => `attempt-${++id}`,
    now: () => new Date('2026-10-12T00:00:00Z'),
  });
  return { orchestrator, exercise };
}

const leak = (runId: string, refs: Record<string, unknown>): Exchange => ({
  runId,
  actor: 'bob',
  kind: 'request',
  request: { method: 'GET', path: `/notes/${refs['notes.alice.id']}` },
  response: { status: 200, body: { note: { owner: 'alice' } } },
  events: [],
});

describe('Orchestrator', () => {
  it('互換性・基準状態・注入を確かめ、同じ seed の脆弱な初期状態で開始する（A02）', async () => {
    const { orchestrator, exercise } = setup();
    const snapshot = await orchestrator.start('test-pack');
    expect(snapshot.attempt).toMatchObject({
      attemptId: 'attempt-1',
      missionId: 'test-pack',
      missionVersion: '1.0.0',
      variantId: 'default',
      recipeId: 'any-owner',
      recipeVersion: '1.0.0',
      appVersion: '1.0.0',
      seed: 4242,
      state: 'Prepared',
    });
    expect(snapshot.attempt.fixtureHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.preflight.map((p) => [p.step, p.status])).toEqual([
      ['compatibility', 'passed'],
      ['baseline', 'passed'],
      ['inject', 'passed'],
      ['prepare', 'passed'],
    ]);
    expect(snapshot.implementations).toEqual({ 'note.read': 'test-pack/any-owner' });
    // 演習用インスタンスは事前検証の後に 1 回だけ準備する
    expect(exercise.prepared).toBe(1);
  });

  it('実行環境にない機能を要求するパックは開始しない', async () => {
    const { orchestrator, exercise } = setup([testPack]);
    const snapshot = await orchestrator.start('test-pack');
    expect(snapshot.blocked).toMatchObject({ kind: 'incompatible', message: expect.stringMatching(/dom-preview/) });
    expect(exercise.prepared).toBe(0);
  });

  it('非互換のパックは開始せず、演習用インスタンスに触れない（A03）', async () => {
    const incompatible = withManifest((m) => (m.appCompatibility.versions = '^2.0.0'));
    const { orchestrator, exercise } = setup([incompatible]);
    const snapshot = await orchestrator.start('test-pack');
    expect(snapshot.attempt.state).toBe('Blocked');
    expect(snapshot.blocked).toMatchObject({ kind: 'incompatible', message: expect.stringMatching(/範囲外/) });
    expect(exercise.prepared).toBe(0);
  });

  it('注入しても攻撃が成立しないレシピは開始不可にし、部分変更を残さない（A03）', async () => {
    const noop = withManifest((m) => (m.mutationRecipes[0]!.apply = [{ hook: 'note.read', implementation: 'test-app/owner-only' }]));
    const { orchestrator, exercise } = setup([noop]);
    const snapshot = await orchestrator.start('test-pack');
    expect(snapshot.attempt.state).toBe('Blocked');
    expect(snapshot.blocked).toMatchObject({ kind: 'injection-failed', message: expect.stringMatching(/攻撃が成立しませんでした/) });
    expect(snapshot.preflight.at(-1)).toMatchObject({ step: 'inject', status: 'failed' });
    expect(exercise.prepared).toBe(0);
  });

  it('二重注入を拒否する', async () => {
    const twice = withManifest((m) => m.mutationRecipes[0]!.apply.push({ hook: 'note.read', implementation: 'test-pack/any-owner' }));
    const { orchestrator } = setup([twice]);
    expect((await orchestrator.start('test-pack')).blocked).toMatchObject({ kind: 'injection-failed', message: expect.stringMatching(/二重/) });
  });

  it('事前検証の自動 probe では再現の達成印が付かず、プレイヤーの操作で付く（A14）', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    expect(snapshot.attempt.badges.reproduction.achieved).toBe(false);

    orchestrator.onExchange(leak('attempt-999:player:1', snapshot.refs));
    expect(snapshot.attempt.badges.reproduction.achieved).toBe(false);

    const runId = orchestrator.newRunId();
    orchestrator.onExchange(leak(runId, snapshot.refs));
    expect(snapshot.attempt.badges.reproduction).toMatchObject({ achieved: true, runId });
    expect(snapshot.attempt.state).toBe('Explored');
  });

  it('正しい対策は再注入せずに検証して防御の達成印を付け、すべての印がそろうと Passed になる（A04）', async () => {
    const { orchestrator, exercise } = setup();
    const snapshot = await orchestrator.start('test-pack');
    orchestrator.onExchange(leak(orchestrator.newRunId(), snapshot.refs));

    await orchestrator.applyDefense('owner-only');
    expect(snapshot.attempt).toMatchObject({ state: 'Repairing', appliedDefense: 'owner-only' });
    const report = await orchestrator.verify();
    expect(report).toMatchObject({ passed: true, configHash: snapshot.attempt.configHash });
    expect(snapshot.attempt.badges.defense).toMatchObject({ achieved: true, runId: report!.runId });
    expect(snapshot.attempt.state).toBe('Repairing');
    expect(exercise.prepared).toBe(1);

    expect(orchestrator.answerTransfer({ q1: 'hide' })).toBe(false);
    expect(snapshot.attempt.badges.understanding.achieved).toBe(false);
    expect(orchestrator.answerTransfer({ q1: 'owner' })).toBe(true);
    expect(snapshot.attempt.state).toBe('Passed');
  });

  it('合格後に対策を変えたら、再検証で合格するまで Passed に戻らない', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    orchestrator.onExchange(leak(orchestrator.newRunId(), snapshot.refs));
    await orchestrator.applyDefense('owner-only');
    await orchestrator.verify();
    orchestrator.answerTransfer({ q1: 'owner' });
    expect(snapshot.attempt.state).toBe('Passed');

    await orchestrator.applyDefense(null);
    expect(snapshot.attempt.state).toBe('Repairing');
    orchestrator.answerTransfer({ q1: 'owner' });
    expect(snapshot.attempt.state).toBe('Repairing');
    expect((await orchestrator.verify())?.passed).toBe(false);
    expect(snapshot.attempt.state).toBe('Repairing');

    await orchestrator.applyDefense('owner-only');
    expect((await orchestrator.verify())?.passed).toBe(true);
    expect(snapshot.attempt.state).toBe('Passed');
  });

  it('検証中は対策の変更も初期状態へ戻す操作も受け付けない', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    await orchestrator.applyDefense('owner-only');
    const verifying = orchestrator.verify();
    expect(snapshot.attempt.state).toBe('Verifying');
    await expect(orchestrator.applyDefense('deny-all')).rejects.toThrow(/Verifying では対策を適用できません/);
    await orchestrator.resetToInitial();
    expect(snapshot.attempt.appliedDefense).toBe('owner-only');
    await verifying;
    expect(snapshot.attempt.state).toBe('Repairing');
  });

  it('すべて拒否する対策は正常系の失敗で合格しない（A05）', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    await orchestrator.applyDefense('deny-all');
    const report = await orchestrator.verify();
    expect(report?.passed).toBe(false);
    expect(report?.outcomes.filter((o) => !o.passed).map((o) => o.group)).toEqual(['normal']);
    expect(snapshot.attempt.badges.defense.achieved).toBe(false);
    expect(snapshot.attempt.state).toBe('Repairing');
  });

  it('対策を変えると構成ハッシュが変わり、取り消すと脆弱な状態の構成に戻る', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    const vulnerable = snapshot.attempt.configHash;
    await orchestrator.applyDefense('owner-only');
    expect(snapshot.attempt.configHash).not.toBe(vulnerable);
    await orchestrator.applyDefense(null);
    expect(snapshot.attempt.configHash).toBe(vulnerable);
    expect(snapshot.implementations).toEqual({ 'note.read': 'test-pack/any-owner' });
  });

  it('初期状態へ戻すと対策を破棄して脆弱な初期状態に戻り、達成印は残る（A13）', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    orchestrator.onExchange(leak(orchestrator.newRunId(), snapshot.refs));
    await orchestrator.applyDefense('owner-only');
    await orchestrator.resetToInitial();
    expect(snapshot.attempt).toMatchObject({ state: 'Prepared', appliedDefense: null });
    expect(snapshot.implementations).toEqual({ 'note.read': 'test-pack/any-owner' });
    expect(snapshot.attempt.badges.reproduction.achieved).toBe(true);
  });

  it('別の演習は基準から作り直し、前の演習の状態を引き継がない（A13）', async () => {
    const { orchestrator } = setup();
    const first = await orchestrator.start('test-pack');
    await orchestrator.applyDefense('owner-only');
    const second = await orchestrator.start('test-pack', { seed: 7 });
    expect(second.attempt.attemptId).not.toBe(first.attempt.attemptId);
    expect(second.attempt).toMatchObject({ state: 'Prepared', appliedDefense: null, seed: 7 });
    expect(second.implementations).toEqual({ 'note.read': 'test-pack/any-owner' });
    // 前の演習のやり取りは新しい演習では無視される
    orchestrator.onExchange(leak(`${first.attempt.attemptId}:player:1`, second.refs));
    expect(second.attempt.badges.reproduction.achieved).toBe(false);
  });

  it('同じパック版と seed なら初期状態と検証結果が同じになる（A21）', async () => {
    const a = setup();
    const b = setup();
    const sa = await a.orchestrator.start('test-pack', { seed: 99 });
    const sb = await b.orchestrator.start('test-pack', { seed: 99 });
    expect(sa.attempt.fixtureHash).toBe(sb.attempt.fixtureHash);
    await a.orchestrator.applyDefense('deny-all');
    await b.orchestrator.applyDefense('deny-all');
    const ra = await a.orchestrator.verify();
    const rb = await b.orchestrator.verify();
    expect(ra?.outcomes.map((o) => [o.testId, o.passed])).toEqual(rb?.outcomes.map((o) => [o.testId, o.passed]));
  });

  it('保存した記録から、同じ seed・対策構成で環境を作り直して続きを始める', async () => {
    const first = setup();
    const snapshot = await first.orchestrator.start('test-pack', { seed: 77 });
    first.orchestrator.onExchange(leak(first.orchestrator.newRunId(), snapshot.refs));
    first.orchestrator.openHint(1);
    await first.orchestrator.applyDefense('deny-all');
    const record = structuredClone(snapshot.attempt);

    const second = setup();
    const resumed = await second.orchestrator.start('test-pack', { resume: record });
    expect(resumed.attempt).toMatchObject({
      attemptId: record.attemptId,
      seed: 77,
      state: 'Repairing',
      appliedDefense: 'deny-all',
      fixtureHash: record.fixtureHash,
      hintsOpened: [1],
    });
    expect(resumed.attempt.badges.reproduction.achieved).toBe(true);
    expect(resumed.implementations).toEqual({ 'note.read': 'test-pack/deny-all' });
  });

  it('開始不可からは事前検証をやり直せる', async () => {
    const { orchestrator } = setup([withManifest((m) => (m.appCompatibility.versions = '^2.0.0'))]);
    await orchestrator.start('test-pack');
    const retried = await orchestrator.retryPreflight();
    expect(retried.attempt.state).toBe('Blocked');
    expect(retried.preflight).toHaveLength(1);
  });

  it('ヒントの利用と解法の閲覧を記録する', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    orchestrator.openHint(2);
    orchestrator.openHint(1);
    orchestrator.openHint(2);
    orchestrator.viewSolution();
    expect(snapshot.attempt).toMatchObject({ hintsOpened: [1, 2], solutionViewed: true });
  });
});

describe('パック出荷前検証', () => {
  it('基準・レシピ・対策の期待どおりかを確かめる', async () => {
    const result = await verifyPack(nodePack, testApp, new Evaluator(() => new EngineRuntime()));
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('期待と違う対策を検出する', async () => {
    const wrong = withManifest((m) => (m.defenses[1]!.expected = 'secure'));
    const result = await verifyPack(wrong, testApp, new Evaluator(() => new EngineRuntime()));
    expect(result.ok).toBe(false);
    expect(result.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(['レシピ any-owner ＋ 対策 deny-all：secure']);
  });
});
