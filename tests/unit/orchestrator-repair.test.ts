// 操作で直す課題（record）で、状態を変える操作が修正の記録になり、検証の前に再生されることを確かめる。
import { expect, it } from 'vitest';
import type { Exchange, MissionPack } from '../../platform/contract';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { EngineRuntime, nodeEvaluator } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

/** POST /notes を修正の記録として扱う record 課題。対策候補は持たない（操作で直す） */
function recordPack(): MissionPack {
  const copy = structuredClone<MissionPack>({ ...nodePack, implementations: {} });
  copy.manifest.repair = { kind: 'record', record: { kind: 'request', request: { method: 'POST', path: '/notes' } }, noun: '加えた変更' };
  copy.manifest.defenses = [];
  return { ...copy, implementations: nodePack.implementations };
}

function setup() {
  const orchestrator = new Orchestrator({
    apps: [testApp], packs: [recordPack()], exercise: new EngineRuntime(),
    evaluator: nodeEvaluator(),
    randomSeed: () => 4242, newId: () => 'attempt-1', now: () => new Date('2026-10-12T00:00:00Z'),
  });
  return orchestrator;
}

/** 他人のメモを読む調査（状態を変えない） */
const read = (runId: string, refs: Record<string, unknown>): Exchange => ({
  runId, actor: 'bob', kind: 'request',
  request: { method: 'GET', path: `/notes/${String(refs['notes.alice.id'])}` },
  response: { status: 200, body: { note: { owner: 'alice' } } }, events: [],
});

/** 状態を変える操作（メモの作成）。record 課題では修正の記録になる */
const post = (runId: string, body: string): Exchange => ({
  runId, actor: 'alice', kind: 'request',
  request: { method: 'POST', path: '/notes', body: { body } },
  response: { status: 201, body: { id: 1 } }, events: [],
});

it('状態を変える操作だけを記録して Repairing へ移り、構成が変わる', async () => {
  const orchestrator = setup();
  const snapshot = await orchestrator.start('test-pack');
  expect(snapshot.attempt.repairLog).toEqual([]);
  const hashBefore = snapshot.attempt.configHash;

  // 状態を変えない読み取り（調査）は記録しない
  await orchestrator.onExchange(read(orchestrator.newRunId(), snapshot.refs));
  expect(snapshot.attempt.repairLog).toEqual([]);

  // 状態を変える操作は記録し、Repairing へ移り、構成が変わる
  await orchestrator.onExchange(post(orchestrator.newRunId(), 'fixed'));
  expect(snapshot.attempt.repairLog).toEqual([{ as: 'alice', request: { method: 'POST', path: '/notes', body: { body: 'fixed' } } }]);
  expect(snapshot.attempt.state).toBe('Repairing');
  expect(snapshot.attempt.milestones.firstDefenseAt).not.toBeNull();
  expect(snapshot.attempt.configHash).not.toBe(hashBefore);
  expect(snapshot.defenseCurrent).toBe(false);
});

it('最初の状態に戻すと記録が消え、構成も開始時へ戻る', async () => {
  const orchestrator = setup();
  const snapshot = await orchestrator.start('test-pack');
  const hashBefore = snapshot.attempt.configHash;
  await orchestrator.onExchange(post(orchestrator.newRunId(), 'fixed'));

  await orchestrator.resetToInitial();
  expect(snapshot.attempt.repairLog).toEqual([]);
  expect(snapshot.attempt.state).toBe('Prepared');
  expect(snapshot.attempt.configHash).toBe(hashBefore);
});

it('検証の間に修正の記録が増えても、検証が終わるまで検証中のままで、初期化も検証の重ね掛けも受け付けない', async () => {
  const orchestrator = setup();
  const snapshot = await orchestrator.start('test-pack');
  await orchestrator.onExchange(post(orchestrator.newRunId(), 'one'));
  const verifying = orchestrator.verify();

  await orchestrator.onExchange(post(orchestrator.newRunId(), 'two'));
  expect(snapshot.attempt.state).toBe('Verifying');
  await expect(orchestrator.verify()).rejects.toThrow('対策を使ってからテストしてください');
  await orchestrator.resetToInitial();
  expect(snapshot.attempt.repairLog).toHaveLength(2);

  await verifying;
  expect(snapshot).toMatchObject({ defenseCurrent: false, attempt: { state: 'Repairing', verifications: 1 } });
  expect(snapshot.attempt.repairLog).toHaveLength(2);
});

/** 修正を 1 件記録した演習と、その記録に使った実行 ID（before） */
async function startRepaired() {
  const orchestrator = setup();
  const snapshot = await orchestrator.start('test-pack');
  const before = orchestrator.newRunId();
  await orchestrator.onExchange(post(before, 'one'));
  return { orchestrator, snapshot, before };
}

it('初期化の途中では検証を始められず、戻す前に発行した実行 ID のやり取りは修正の記録にならない', async () => {
  const { orchestrator, snapshot, before } = await startRepaired();

  const resetting = orchestrator.resetToInitial();
  // 初期化が順番を得て状態を戻したあと（実装とデータを戻している間）
  await Promise.resolve();
  expect(snapshot.attempt.state).toBe('Prepared');
  await expect(orchestrator.verify()).rejects.toThrow('対策を使ってからテストしてください');
  await orchestrator.onExchange(post(before, 'late'));
  await resetting;
  expect(snapshot.attempt).toMatchObject({ state: 'Prepared', repairLog: [] });

  const after = orchestrator.newRunId();
  expect(after).not.toBe(before);
  await orchestrator.onExchange(post(after, 'again'));
  expect(snapshot.attempt).toMatchObject({ state: 'Repairing', repairLog: [{ as: 'alice' }] });
});

it('初期化の順番を待つ間に届いた修正の操作は、戻す前の操作なので記録しない', async () => {
  const { orchestrator, snapshot, before } = await startRepaired();

  const resetting = orchestrator.resetToInitial();
  const late = orchestrator.onExchange(post(before, 'late'));
  await Promise.all([resetting, late]);
  expect(snapshot.attempt).toMatchObject({ state: 'Prepared', repairLog: [] });
});
