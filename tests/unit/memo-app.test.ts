// メモアプリの基準実装（状態 S）が共通テストをすべて通すこと（spec A01）。複数の seed で確かめる
import { beforeAll, describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import { describeEvent } from '../../apps/memo/events';
import { BASELINE, type PickNeighbors } from '../../apps/memo/hooks';
import { NAME_PATTERN, NAME_RULE, validateNameWith } from '../../apps/memo/profile';
import type { PrepareOptions } from '../../platform/contract';
import { runSteps, type ScenarioInvoker } from '../../platform/evaluator/scenario';
import { VERIFICATION_SEEDS } from '../../platform/orchestrator/pack-verification';
import { AppEngine } from '../../runtimes/browser/engine';
import { readMachineAsset } from '../support/machine-assets';
import { requestOnly } from '../support/request-only';


const options = (seed: number): PrepareOptions => ({
  attemptId: `memo-${seed}`,
  app: { id: 'memo', version: memoApp.descriptor.version },
  fixture: { generator: 'memo.default', seed },
  implementations: {},
});

function invokerFor(engine: AppEngine): ScenarioInvoker {
  return {
    session: async (actor) => (await engine.invoke({ kind: 'session', actor })).session ?? null,
    request: async (session, request) => {
      const { response, events } = await engine.invoke({ kind: 'request', session, request });
      return { response: response!, events };
    },
    render: async () => {
      throw new Error('Node では画面を描画しない');
    },
  };
}

describe.each(VERIFICATION_SEEDS)('メモアプリの基準実装（seed %i）', (seed) => {
  const engine = new AppEngine(readMachineAsset);
  beforeAll(() => engine.prepare(options(seed)));

  it.each(requestOnly(memoApp.tests).map((t) => [t.id, t] as const))('%s', async (_, test) => {
    // 各テストは初期データから実行する
    const { refs } = await engine.reset();
    expect(await runSteps(test.steps, refs, invokerFor(engine))).toMatchObject({ passed: true });
  });
});

describe('初期データ', () => {
  it('同じ seed なら同じ、違う seed なら利用者 ID・メモ ID・内容が変わる', async () => {
    const engine = new AppEngine(readMachineAsset);
    const a = await engine.prepare(options(1));
    const b = await engine.prepare(options(1));
    const c = await engine.prepare(options(2));
    expect(b).toEqual(a);
    expect(c.hash).not.toBe(a.hash);
    expect(c.refs['users.alice.id']).not.toBe(a.refs['users.alice.id']);
    expect(c.refs['memos.alice.private.id']).not.toBe(a.refs['memos.alice.private.id']);
  });

  it('どの seed でも ID が重複せずに作れる', async () => {
    const engine = new AppEngine(readMachineAsset);
    for (let seed = 0; seed < 200; seed++) await engine.prepare(options(seed));
  });

  it('認可の判断を観測イベントとして記録する', async () => {
    const engine = new AppEngine(readMachineAsset);
    const { refs } = await engine.prepare(options(3));
    const session = (await engine.invoke({ kind: 'session', actor: 'bob' })).session ?? null;
    const { response, events } = await engine.invoke({ kind: 'request', session, request: { method: 'GET', path: `/api/memos/${refs['memos.alice.private.id']}` } });
    expect(response?.status).toBe(403);
    expect(events).toContainEqual({
      type: 'authz.decision',
      data: { action: 'read', subject: refs['users.bob.id']!, resource: refs['memos.alice.private.id']!, owner: refs['users.alice.id']!, decision: 'deny', reason: '所有者ではない' },
    });
  });
});

describe('観測イベントの説明', () => {
  it('画面に出たコメントの文字列を、計測した値のまま説明する', () => {
    expect(describeEvent({ type: 'comment.rendered', data: { text: '価格は <100> 円' } })).toBe('画面に出たコメント：価格は <100> 円');
  });

  it('知らない種類は説明しない', () => {
    expect(describeEvent({ type: 'unknown', data: {} })).toBeNull();
  });

  const regexMatch = (data: Record<string, string | number>) =>
    describeEvent({ type: 'regex.match', data: { engine: 'PCRE2 10.49', pattern: '^a+$', subject: 'aaaa!', length: 5, matchLimit: 1_000_000, ...data } });

  it('正規表現の照合を、パターン・入力・結果・パターンの項目を試した回数で説明する', () => {
    expect(regexMatch({ outcome: 'no-match', steps: 18_432 })).toBe('正規表現：^a+$（PCRE2 10.49）\n入力：aaaa!（5 文字）\n結果：一致しない\nパターンの項目を試した回数：18,432 回');
    expect(regexMatch({ outcome: 'match', steps: 9 })).toContain('結果：一致した\n');
  });

  it('打ち切られた照合は、エンジンの処理の上限に達したことを示す。試した回数を上限の数え方と混ぜない', () => {
    expect(regexMatch({ outcome: 'limit', steps: 1_124_986 })).toContain('結果：結論が出ないまま打ち切り（エンジンの処理の上限 match limit 1,000,000 に達した）\nパターンの項目を試した回数：1,124,986 回');
  });

  it('知らない結果の照合は説明しない', () => {
    expect(regexMatch({ outcome: 'unknown', steps: 1 })).toBeNull();
    expect(describeEvent({ type: 'regex.match', data: { outcome: 1 } })).toBeNull();
  });
});

describe('表示名の変更', () => {
  const engine = new AppEngine(readMachineAsset);
  beforeAll(() => engine.prepare(options(1)));

  const change = async (body: unknown) => {
    await engine.reset();
    const session = (await engine.invoke({ kind: 'session', actor: 'alice' })).session ?? null;
    return engine.invoke({ kind: 'request', session, request: { method: 'PUT', path: '/api/me', body: body as never } });
  };

  it('照合の記録（エンジン・パターン・入力・結果・試した回数・処理の上限）を観測イベントに残す', async () => {
    const { response, events } = await change({ name: 'taro.yamada' });
    expect(response).toMatchObject({ status: 200, body: { user: { key: 'alice', name: 'taro.yamada' } } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'regex.match', data: { pattern: NAME_PATTERN, subject: 'taro.yamada', length: 11, outcome: 'match', steps: 9, matchLimit: 1_000_000 } });
    expect(events[0]?.data.engine).toMatch(/^PCRE2 10\.\d+$/);
  });

  it('決まりに合わない表示名は、照合が最後まで終わってから、決まりを示して断る', async () => {
    const { response, events } = await change({ name: `${'a'.repeat(19)}!` });
    expect(response).toEqual({ status: 400, body: { error: NAME_RULE, field: 'name' } });
    expect(events).toMatchObject([
      { type: 'regex.match', data: { outcome: 'no-match', steps: 59 } },
      { type: 'validation.failed', data: { field: 'name', message: NAME_RULE } },
    ]);
  });

  it('未入力・文字列でない・長すぎる表示名は、照合の前に断る', async () => {
    for (const body of [{ name: '' }, { name: 42 }, {}, null, { name: 'a'.repeat(21) }]) {
      const { response, events } = await change(body);
      expect(response?.status).toBe(400);
      expect(events.map((event) => event.type)).toEqual(['validation.failed']);
    }
  });

  it('正規表現エンジンを持たない実行環境では、黙って通さずに失敗する', () => {
    const ctx = { emit: () => undefined } as never;
    expect(() => validateNameWith(NAME_PATTERN)(ctx, 'taro')).toThrow('正規表現エンジンが用意されていません');
  });
});

describe('前後のメモの移動先（基準実装）', () => {
  const pick = BASELINE['memo/neighbors-own']?.run as PickNeighbors;

  it('自分のメモの中から、前後に最も近い ID を選ぶ', () => {
    expect(pick({ id: 20, ownIds: [30, 10, 25, 5] })).toEqual({ prev: 10, next: 25 });
  });

  it('前後に自分のメモがなければ null にする', () => {
    expect(pick({ id: 5, ownIds: [5] })).toEqual({ prev: null, next: null });
  });
});
