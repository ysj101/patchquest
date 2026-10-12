// メモアプリの基準実装（状態 S）が共通テストをすべて通すこと（spec A01）。複数の seed で確かめる
import { beforeAll, describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import type { PrepareOptions } from '../../platform/contract';
import { runSteps, type ScenarioInvoker } from '../../platform/evaluator/scenario';
import { AppEngine } from '../../runtimes/browser/engine';
import { requestOnly } from '../support/request-only';

const SEEDS = [1, 42, 20261012];

const options = (seed: number): PrepareOptions => ({
  attemptId: `memo-${seed}`,
  app: { id: 'memo', version: memoApp.descriptor.version },
  fixture: { generator: 'memo.default', seed },
  implementations: {},
});

function invokerFor(engine: AppEngine): ScenarioInvoker {
  return {
    session: async (actor) => engine.invoke({ kind: 'session', actor }).session ?? null,
    request: async (session, request) => {
      const { response, events } = engine.invoke({ kind: 'request', session, request });
      return { response: response!, events };
    },
    render: async () => {
      throw new Error('Node では画面を描画しない');
    },
  };
}

describe.each(SEEDS)('メモアプリの基準実装（seed %i）', (seed) => {
  const engine = new AppEngine();
  beforeAll(() => engine.prepare(options(seed)));

  it.each(requestOnly(memoApp.tests).map((t) => [t.id, t] as const))('%s', async (_, test) => {
    // 各テストは初期データから実行する
    const { refs } = await engine.reset();
    expect(await runSteps(test.steps, refs, invokerFor(engine))).toMatchObject({ passed: true });
  });
});

describe('初期データ', () => {
  it('同じ seed なら同じ、違う seed なら利用者 ID・メモ ID・内容が変わる', async () => {
    const engine = new AppEngine();
    const a = await engine.prepare(options(1));
    const b = await engine.prepare(options(1));
    const c = await engine.prepare(options(2));
    expect(b).toEqual(a);
    expect(c.hash).not.toBe(a.hash);
    expect(c.refs['users.alice.id']).not.toBe(a.refs['users.alice.id']);
    expect(c.refs['memos.alice.private.id']).not.toBe(a.refs['memos.alice.private.id']);
  });

  it('どの seed でも ID が重複せずに作れる', async () => {
    const engine = new AppEngine();
    for (let seed = 0; seed < 200; seed++) await engine.prepare(options(seed));
  });

  it('認可の判断を観測イベントとして記録する', async () => {
    const engine = new AppEngine();
    const { refs } = await engine.prepare(options(3));
    const session = engine.invoke({ kind: 'session', actor: 'bob' }).session ?? null;
    const { response, events } = engine.invoke({ kind: 'request', session, request: { method: 'GET', path: `/api/memos/${refs['memos.alice.private.id']}` } });
    expect(response?.status).toBe(403);
    expect(events).toContainEqual({
      type: 'authz.decision',
      data: { action: 'read', subject: refs['users.bob.id']!, resource: refs['memos.alice.private.id']!, owner: refs['users.alice.id']!, decision: 'deny', reason: '所有者ではない' },
    });
  });
});
