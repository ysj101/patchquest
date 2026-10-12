import { describe, expect, it } from 'vitest';
import { memoApp } from '../../apps/memo';
import type { Exchange, TestCase } from '../../platform/contract';
import { Evaluator, configHash, detectReproduction, groupOf, isCurrent, type EvaluationSubject } from '../../platform/evaluator/evaluator';
import { EngineRuntime } from '../support/engine-runtime';
import { requestOnly } from '../support/request-only';
import { testPack } from '../support/test-pack';

const memoSubject = (seed: number): EvaluationSubject => ({
  attemptId: `memo-${seed}`,
  app: { id: 'memo', version: memoApp.descriptor.version },
  fixture: { generator: 'memo.default', seed },
  implementations: {},
});

const packSubject = (implementations: Record<string, string>): EvaluationSubject => ({
  attemptId: 'pack-1',
  app: { id: 'test-app', version: '1.0.0' },
  fixture: { generator: 'test.default', seed: 5 },
  implementations,
});

const { manifest } = testPack;
const memoTests = requestOnly(memoApp.tests);
const packTests: TestCase[] = requestOnly(manifest.tests.cases);

describe('Evaluator', () => {
  it('基準アプリの全テストを検証インスタンスで実行して合格する（A01）', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const report = await evaluator.runSuite(memoSubject(11), memoTests, [], 'run-s', 'hash-s');
    expect(report.outcomes.filter((o) => !o.passed)).toEqual([]);
    expect(report).toMatchObject({ runId: 'run-s', attemptId: 'memo-11', configHash: 'hash-s', passed: true });
    expect(new Set(report.outcomes.map((o) => o.group))).toEqual(new Set(['normal', 'regression']));
  });

  it('脆弱な状態では攻撃阻止のテストだけが失敗し、期待と実測を返す', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const report = await evaluator.runSuite(packSubject({ 'note.read': 'test-pack/any-owner' }), packTests, manifest.tests.target, 'run-v', 'hash-v');
    const failed = report.outcomes.filter((o) => !o.passed);
    expect(failed).toEqual([
      expect.objectContaining({ testId: 'test.read-other-denied', group: 'attack', expected: expect.stringMatching(/^bob が GET \/notes\/\d+ → status 403 か 404$/), actual: 'status が 403 か 404 ではない（実測 200）' }),
    ]);
    expect(report.passed).toBe(false);
  });

  it('すべて拒否する対策は正常系の失敗で不合格になり、正しい対策はすべて合格する（A05 の基盤）', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const denyAll = await evaluator.runSuite(packSubject({ 'note.read': 'test-pack/deny-all' }), packTests, manifest.tests.target, 'run-d', 'h');
    expect(denyAll.outcomes.filter((o) => !o.passed).map((o) => o.group)).toEqual(['normal']);
    expect(denyAll.passed).toBe(false);

    const secure = await evaluator.runSuite(packSubject({ 'note.read': 'test-app/owner-only' }), packTests, manifest.tests.target, 'run-f', 'h');
    expect(secure.passed).toBe(true);
  });

  it('攻撃の成立条件（probe）を確かめる。基準状態では成立しない', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    expect(await evaluator.runProbes(packSubject({ 'note.read': 'test-pack/any-owner' }), manifest.probes, 'run-p')).toEqual([
      expect.objectContaining({ probeId: 'read-other', succeeded: true }),
    ]);
    expect(await evaluator.runProbes(packSubject({}), manifest.probes, 'run-p2')).toEqual([expect.objectContaining({ probeId: 'read-other', succeeded: false })]);
  });

  it('各テストは初期データから実行され、前のテストの副作用を受けない', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const deleteThenRead: TestCase[] = [
      memoApp.tests.find((t) => t.id === 'memo.delete-own')!,
      memoApp.tests.find((t) => t.id === 'memo.read-own')!,
    ];
    expect((await evaluator.runSuite(memoSubject(12), deleteThenRead, [], 'run-i', 'h')).passed).toBe(true);
  });

  it('新しい検証が始まると古い検証は結果を返さずに stopped で終わる（A20 の基盤）', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const first = evaluator.runSuite(memoSubject(13), memoTests, [], 'old', 'h');
    const second = evaluator.runSuite(memoSubject(13), memoTests, [], 'new', 'h');
    await expect(first).rejects.toMatchObject({ code: 'stopped' });
    expect(await second).toMatchObject({ runId: 'new', passed: true });
  });
});

describe('判定の補助', () => {
  it('target に含まれるテストは攻撃阻止、それ以外のセキュリティテストは回帰に分類する', () => {
    const security = { id: 's', category: 'security', title: '', steps: [] } as TestCase;
    expect(groupOf(security, ['s'])).toBe('attack');
    expect(groupOf(security, [])).toBe('regression');
    expect(groupOf({ ...security, category: 'normal' }, [])).toBe('normal');
  });

  it('構成が変わったら過去の合格を現在の合格として扱わない', async () => {
    const base = { missionId: 'test-pack', missionVersion: '1.0.0', recipeId: 'any-owner', recipeVersion: '1.0.0', app: { id: 'test-app', version: '1.0.0' } };
    const before = await configHash({ ...base, implementations: { 'note.read': 'test-app/owner-only' } });
    const after = await configHash({ ...base, implementations: { 'note.read': 'test-pack/deny-all' } });
    expect(before).not.toBe(after);
    const report = { runId: 'r', attemptId: 'a', configHash: before, outcomes: [], passed: true, startedAt: '', elapsedMs: 0 };
    expect(isCurrent(report, before)).toBe(true);
    expect(isCurrent(report, after)).toBe(false);
  });

  it('プレイヤーのやり取りが probe の detect に合えば再現とみなす', () => {
    const refs = { 'notes.alice.id': 12 };
    const leak: Exchange = {
      runId: 'r',
      actor: 'bob',
      kind: 'request',
      request: { method: 'GET', path: '/notes/12' },
      response: { status: 200, body: { note: { owner: 'alice' } } },
      events: [],
    };
    expect(detectReproduction(leak, manifest.probes, refs)).toBe('read-other');
    expect(detectReproduction({ ...leak, actor: 'alice' }, manifest.probes, refs)).toBeNull();
    expect(detectReproduction({ ...leak, response: { status: 403, body: {} } }, manifest.probes, refs)).toBeNull();
  });
});
