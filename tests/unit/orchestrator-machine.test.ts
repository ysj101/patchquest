// 演習の状態遷移表（EXERCISE_MACHINE）と、進行役が処理の途中（検証中・初期化中・対策の切り替え中）でも表から外れないことを確かめる。
// 操作で直す課題（record）の処理の途中は orchestrator-repair.test.ts で確かめる。
import { describe, expect, it } from 'vitest';
import { EXERCISE_MACHINE, isInExercise, nextExerciseState, type ExerciseEvent, type ExerciseState } from '../../platform/contract';
import { Orchestrator } from '../../platform/orchestrator/orchestrator';
import { EngineRuntime, nodeEvaluator } from '../support/engine-runtime';
import { nodePack } from '../support/node-pack';
import { testApp } from '../support/test-app';

const STATES = Object.keys(EXERCISE_MACHINE) as ExerciseState[];
const arrows = STATES.flatMap((from) => Object.entries(EXERCISE_MACHINE[from]).map(([event, to]) => ({ from, event: event as ExerciseEvent, to })));

/** start から出来事をたどって着ける状態をすべて集める */
function reachable(start: ExerciseState): Set<ExerciseState> {
  const seen = new Set<ExerciseState>([start]);
  const queue = [start];
  for (let from = queue.shift(); from; from = queue.shift()) {
    for (const to of Object.values(EXERCISE_MACHINE[from])) {
      if (!seen.has(to)) queue.push(to);
      seen.add(to);
    }
  }
  return seen;
}

describe('演習の状態遷移表', () => {
  it('Selected からすべての状態に着け、どの状態からも抜け出せる', () => {
    expect([...reachable('Selected')].sort()).toEqual([...STATES].sort());
    for (const state of STATES) expect(Object.values(EXERCISE_MACHINE[state]).some((to) => to !== state), state).toBe(true);
  });

  it('演習中の状態には事前検証の合格を経てのみ入り、Passed には completed でだけ入る', () => {
    const entering = arrows.filter(({ from, to }) => !isInExercise(from) && isInExercise(to));
    expect(entering).toEqual([{ from: 'Preflight', event: 'preflight-passed', to: 'Prepared' }]);
    expect(arrows.filter(({ to }) => to === 'Passed').map(({ event }) => event)).toEqual(['completed', 'completed']);
  });

  it('検証中は、検証の開始も初期化も起こせず、構成が変わっても検証が終わるまで検証中に留まる', () => {
    expect(nextExerciseState('Verifying', 'verification-started')).toBeUndefined();
    expect(nextExerciseState('Verifying', 'reset')).toBeUndefined();
    expect(nextExerciseState('Verifying', 'repair-changed')).toBe('Verifying');
    expect(arrows.filter(({ from, to }) => from === 'Verifying' && to !== 'Verifying').map(({ event }) => event).sort()).toEqual(['completed', 'verification-settled']);
  });

  it('検証は、修正の構成を変えたあと（Repairing）か合格済み（Passed）からだけ始められる', () => {
    expect(arrows.filter(({ event }) => event === 'verification-started').map(({ from }) => from).sort()).toEqual(['Passed', 'Repairing']);
  });
});

function setup() {
  const exercise = new EngineRuntime();
  const orchestrator = new Orchestrator({
    apps: [testApp], packs: [nodePack], exercise, evaluator: nodeEvaluator(),
    randomSeed: () => 4242, newId: () => 'attempt-1', now: () => new Date('2026-10-12T00:00:00Z'),
  });
  return { orchestrator, exercise };
}

describe('処理の途中の進行', () => {
  it('初期化を頼んだ直後、順番が来る前に検証が始まったら、初期化は行わない', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    await orchestrator.applyDefense('owner-only');
    const resetting = orchestrator.resetToInitial();
    const verifying = orchestrator.verify();
    await resetting;
    expect(snapshot.attempt).toMatchObject({ state: 'Verifying', appliedDefense: 'owner-only' });
    expect((await verifying)?.passed).toBe(true);
    expect(snapshot).toMatchObject({ defenseCurrent: true, attempt: { state: 'Repairing', appliedDefense: 'owner-only' } });
  });

  it('対策の切り替えと初期化を続けて頼んでも 1 件ずつ順に行い、最後に頼んだ結果になる', async () => {
    const { orchestrator, exercise } = setup();
    const snapshot = await orchestrator.start('test-pack');
    const read = async () => {
      const { session } = await exercise.invoke({ kind: 'session', actor: 'bob' });
      return (await exercise.invoke({ kind: 'request', session: session ?? null, request: { method: 'GET', path: `/notes/${String(snapshot.refs['notes.alice.id'])}` } })).response?.status;
    };

    await Promise.all([orchestrator.applyDefense('deny-all'), orchestrator.applyDefense('owner-only'), orchestrator.applyDefense('deny-all')]);
    expect(snapshot.attempt).toMatchObject({ state: 'Repairing', appliedDefense: 'deny-all' });
    expect(snapshot.implementations).toEqual({ 'note.read': 'test-pack/deny-all' });
    expect(await read()).toBe(403);

    await Promise.all([orchestrator.applyDefense('owner-only'), orchestrator.resetToInitial()]);
    expect(snapshot.attempt).toMatchObject({ state: 'Prepared', appliedDefense: null });
    expect(snapshot.implementations).toEqual({ 'note.read': 'test-pack/any-owner' });
    expect(await read()).toBe(200);
  });

  it('順番を待つ間に別の演習が始まったら、前の演習への対策の切り替えは行わない', async () => {
    const { orchestrator } = setup();
    await orchestrator.start('test-pack');
    const first = orchestrator.applyDefense('owner-only');
    const stale = orchestrator.applyDefense('deny-all');
    const restarted = orchestrator.start('test-pack');
    await Promise.all([first.catch(() => undefined), stale, restarted]);
    expect(orchestrator.snapshot?.attempt).toMatchObject({ state: 'Prepared', appliedDefense: null });
  });

  it('事前検証は、始める前（Selected）か止まったあと（Blocked）にだけやり直せ、演習中に頼んでも記録を変えない', async () => {
    const { orchestrator } = setup();
    const snapshot = await orchestrator.start('test-pack');
    await expect(orchestrator.retryPreflight()).rejects.toThrow('状態 Prepared では preflight-started を起こせません');
    expect(snapshot.preflight).toHaveLength(4);
    expect(snapshot.vulnerableVerification).not.toBeNull();
  });
});

it('防御と理解がそろったあとで再現を達成したら、その場で Passed になる', async () => {
  const { orchestrator } = setup();
  const snapshot = await orchestrator.start('test-pack');
  await orchestrator.applyDefense('owner-only');
  await orchestrator.verify();
  orchestrator.answerTransfer({ q1: 'owner' });
  expect(snapshot.attempt.state).toBe('Repairing');

  const reproduced = await orchestrator.onExchange({
    runId: orchestrator.newRunId(), actor: 'bob', kind: 'request',
    request: { method: 'GET', path: `/notes/${String(snapshot.refs['notes.alice.id'])}` },
    response: { status: 200, body: { note: { owner: 'alice' } } }, events: [],
  });
  expect(reproduced).toBe(true);
  expect(snapshot.attempt.state).toBe('Passed');
});
