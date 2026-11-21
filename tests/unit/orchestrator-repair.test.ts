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
