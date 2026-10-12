import { describe, expect, it } from 'vitest';
import type { Exchange, ObservedEvent, Step } from '../../platform/contract';
import { checkEvents, checkResponse, expand, matchesExchange, runSteps, select, type ScenarioInvoker } from '../../platform/evaluator/scenario';

const scope = { 'users.alice.id': 101, 'memos.alice.private.body': '合言葉' };

describe('expand', () => {
  it('文字列全体が 1 つの {{キー}} なら値の型を保ち、それ以外は文字列に埋め込む', () => {
    expect(expand({ id: '{{users.alice.id}}', path: '/api/users/{{users.alice.id}}' }, scope)).toEqual({ id: 101, path: '/api/users/101' });
  });

  it('未定義のキーは例外にする', () => {
    expect(() => expand('{{missing}}', scope)).toThrow(/未定義の値 \{\{missing\}\}/);
  });
});

describe('select', () => {
  it("'*' で配列の全要素を集める", () => {
    expect(select({ memos: [{ ownerId: 1 }, { ownerId: 2 }] }, 'memos.*.ownerId')).toEqual({ values: [1, 2], wildcard: true });
    expect(select({ a: [10, 20] }, 'a.1')).toEqual({ values: [20], wildcard: false });
    expect(select({ a: 1 }, '')).toEqual({ values: [{ a: 1 }], wildcard: false });
  });
});

describe('checkResponse', () => {
  it('status と本文の条件を確かめ、違いを説明する', () => {
    const res = { status: 200, body: { memo: { body: '合言葉' } } };
    expect(checkResponse(res, { status: [403, 404] }, scope)).toEqual(['status が 403 か 404 ではない（実測 200）']);
    expect(checkResponse(res, { body: [{ path: '', is: { notContains: '{{memos.alice.private.body}}' } }] }, scope)).toHaveLength(1);
    expect(checkResponse(res, { status: 200, body: [{ path: 'memo.body', is: { equals: '{{memos.alice.private.body}}' } }] }, scope)).toEqual([]);
  });

  it("'*' の条件は全要素に求め、空配列は満たす", () => {
    const ok = { status: 200, body: { memos: [{ ownerId: 101 }] } };
    const leak = { status: 200, body: { memos: [{ ownerId: 101 }, { ownerId: 202 }] } };
    const matcher = [{ path: 'memos.*.ownerId', is: { equals: '{{users.alice.id}}' } }];
    expect(checkResponse(ok, { body: matcher }, scope)).toEqual([]);
    expect(checkResponse(leak, { body: matcher }, scope)).toHaveLength(1);
    expect(checkResponse({ status: 200, body: { memos: [] } }, { body: matcher }, scope)).toEqual([]);
  });
});

describe('checkEvents', () => {
  const events: ObservedEvent[] = [{ type: 'authz.decision', data: { decision: 'deny', subject: 101 } }];

  it('条件に合う事象の有無を確かめる', () => {
    expect(checkEvents(events, [{ type: 'authz.decision', where: [{ path: 'decision', is: { equals: 'deny' } }] }], scope)).toEqual([]);
    expect(checkEvents(events, [{ type: 'dom.marker', presence: 'absent' }], scope)).toEqual([]);
    expect(checkEvents(events, [{ type: 'authz.decision', presence: 'absent' }], scope)).toHaveLength(1);
  });
});

describe('runSteps', () => {
  function invoker(responses: Record<string, { status: number; body: unknown }>): ScenarioInvoker & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      session: async (actor) => (actor === 'anonymous' ? null : `token-${actor}`),
      request: async (session, req) => {
        calls.push(`${session} ${req.method} ${req.path} ${JSON.stringify(req.body ?? null)}`);
        return { response: (responses[`${req.method} ${req.path}`] ?? { status: 404, body: null }) as never, events: [] };
      },
      render: async () => ({ events: [] }),
    };
  }

  it('capture した値を後の手順で使い、全手順が期待どおりなら合格する', async () => {
    const inv = invoker({ 'POST /api/memos': { status: 201, body: { memo: { id: 7 } } }, 'GET /api/memos/7': { status: 200, body: {} } });
    const steps: Step[] = [
      { kind: 'request', as: 'alice', request: { method: 'POST', path: '/api/memos', body: { ownerId: '{{users.alice.id}}' } }, expect: { status: 201 }, capture: { id: 'memo.id' } },
      { kind: 'request', as: 'alice', request: { method: 'GET', path: '/api/memos/{{capture.id}}' }, expect: { status: 200 } },
    ];
    expect(await runSteps(steps, scope, inv)).toEqual({ passed: true, expected: 'alice が GET /api/memos/7 → status 200', actual: 'status 200' });
    expect(inv.calls).toEqual(['token-alice POST /api/memos {"ownerId":101}', 'token-alice GET /api/memos/7 null']);
  });

  it('最初に期待と違った手順で止め、期待と実測を返す', async () => {
    const inv = invoker({ 'GET /api/memos/1': { status: 200, body: {} } });
    const result = await runSteps(
      [
        { kind: 'request', as: 'bob', request: { method: 'GET', path: '/api/memos/1' }, expect: { status: [403, 404] } },
        { kind: 'request', as: 'bob', request: { method: 'GET', path: '/never' } },
      ],
      scope,
      inv,
    );
    expect(result).toEqual({ passed: false, expected: 'bob が GET /api/memos/1 → status 403 か 404', actual: 'status が 403 か 404 ではない（実測 200）' });
    expect(inv.calls).toHaveLength(1);
  });

  it('未定義の値を参照する手順は不合格にする', async () => {
    const result = await runSteps([{ kind: 'request', as: 'alice', request: { method: 'GET', path: '/api/memos/{{nope}}' } }], scope, invoker({}));
    expect(result).toMatchObject({ passed: false, actual: expect.stringMatching(/未定義の値/) });
  });
});

describe('matchesExchange', () => {
  const exchange: Exchange = {
    runId: 'r1',
    actor: 'bob',
    kind: 'request',
    request: { method: 'GET', path: '/api/memos/1234' },
    response: { status: 200, body: { memo: { ownerId: 101 } } },
    events: [],
  };

  it('利用者・パス・応答の条件がすべて合えば一致する', () => {
    const matcher = {
      actor: { not: 'alice' },
      request: { method: 'GET' as const, path: '/api/memos/*' },
      response: { status: 200, body: [{ path: 'memo.ownerId', is: { equals: '{{users.alice.id}}' } }] },
    };
    expect(matchesExchange(exchange, matcher, scope)).toBe(true);
    expect(matchesExchange({ ...exchange, actor: 'alice' }, matcher, scope)).toBe(false);
    expect(matchesExchange({ ...exchange, response: { status: 403, body: {} } }, matcher, scope)).toBe(false);
    expect(matchesExchange({ ...exchange, request: { method: 'GET', path: '/api/memos/1234/x' } }, matcher, scope)).toBe(false);
  });
});
