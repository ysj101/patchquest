// ステージ到達時刻が本人操作でだけ記録され、保持されることを確かめる。
import { expect, it } from 'vitest';
import { emptyMilestones } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { EngineRuntime } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

const firstInstant = new Date('2026-10-15T00:00:00Z');
const request = (runId: string) => ({ runId, kind: 'request' as const, actor: 'alice', events: [], request: { method: 'GET' as const, path: '/notes' } });

async function setup() {
  let instant = firstInstant;
  const orchestrator = new Orchestrator({
    apps: [testApp], packs: [nodePack], exercise: new EngineRuntime(),
    evaluator: new Evaluator(() => new EngineRuntime()), now: () => instant,
  });
  const { attempt, refs } = await orchestrator.start('test-pack');
  return { orchestrator, attempt, refs, advance: () => { instant = new Date('2026-10-16T00:00:00Z'); } };
}

async function reachMilestones(orchestrator: Orchestrator) {
  orchestrator.markBriefed();
  orchestrator.onExchange(request(orchestrator.newRunId()));
  await orchestrator.applyDefense('owner-only');
}

it('本人操作でだけ到達時刻を記録し、ステージ到達で防御の達成印は付かない', async () => {
  const { orchestrator, attempt } = await setup();
  expect(attempt.milestones).toEqual(emptyMilestones());
  orchestrator.onExchange({ runId: orchestrator.newRunId(), kind: 'render', actor: 'alice', events: [] });
  orchestrator.onExchange(request('古い実行'));
  await orchestrator.applyDefense(null);
  expect(attempt.milestones).toEqual(emptyMilestones());
  await reachMilestones(orchestrator);
  const timestamp = firstInstant.toISOString();
  expect(attempt.milestones).toEqual({ briefedAt: timestamp, firstRequestAt: timestamp, firstDefenseAt: timestamp });
  expect(attempt.badges.defense.achieved).toBe(false);
});

it('繰り返し操作や対策の取り消し・再適用で初回の時刻は変わらない', async () => {
  const { orchestrator, attempt, advance } = await setup();
  await reachMilestones(orchestrator);
  const expected = { ...attempt.milestones };
  advance();
  await orchestrator.applyDefense(null);
  await reachMilestones(orchestrator);
  expect(attempt.milestones).toEqual(expected);
});

it('初期状態へリセットしても到達時刻を保つ', async () => {
  const { orchestrator, attempt } = await setup();
  await reachMilestones(orchestrator);
  const expected = { ...attempt.milestones };
  await orchestrator.resetToInitial();
  expect(attempt.milestones).toEqual(expected);
});

it('続きからの再開は到達時刻を保ち、新しい演習は未到達で始まる', async () => {
  const { orchestrator, attempt, advance } = await setup();
  await reachMilestones(orchestrator);
  const record = structuredClone(attempt);
  advance();
  const resumed = await orchestrator.start('test-pack', { resume: record });
  expect(resumed.attempt.milestones).toEqual(record.milestones);
  const fresh = await orchestrator.start('test-pack');
  expect(fresh.attempt.milestones).toEqual(emptyMilestones());
});

it('旧版の対策を復元しても未記録の対策到達時刻を付けない', async () => {
  const { orchestrator, attempt } = await setup();
  const legacy = structuredClone(attempt);
  legacy.appliedDefense = 'owner-only';
  const restored = await orchestrator.start('test-pack', { resume: legacy });
  expect(restored.attempt.appliedDefense).toBe('owner-only');
  expect(restored.attempt.milestones.firstDefenseAt).toBeNull();
});

it('初期表示の要求は調査に数えず再現判定を保ち、読み込み後は同じ実行 ID の要求を数える', async () => {
  const { orchestrator, attempt, refs } = await setup();
  const runId = orchestrator.newRunId();
  orchestrator.onExchange({
    ...request(runId),
    actor: 'bob',
    request: { method: 'GET', path: `/notes/${refs['notes.alice.id']}` },
    response: { status: 200, body: { note: { owner: 'alice' } } },
  }, { initialView: true });
  expect(attempt.badges.reproduction.achieved).toBe(true);
  expect(attempt.milestones.firstRequestAt).toBeNull();
  orchestrator.onExchange(request(runId));
  expect(attempt.milestones.firstRequestAt).toBe(firstInstant.toISOString());
});
