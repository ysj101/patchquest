import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../platform/contract';
import { MAX_PROGRESS_BYTES, PROGRESS_FORMAT } from '../../platform/progress/schema';
import { ProgressStore, matchesCurrentVersion } from '../../platform/progress/store';
import { testPack } from '../support/test-pack';

const attempt = (id: string, overrides: Partial<AttemptRecord> = {}): AttemptRecord => ({
  attemptId: id,
  missionId: 'test-pack',
  missionVersion: '1.0.0',
  variantId: 'default',
  recipeId: 'any-owner',
  recipeVersion: '1.0.0',
  appId: 'test-app',
  appVersion: '1.0.0',
  seed: 42,
  fixtureHash: 'f'.repeat(64),
  createdAt: `2026-10-12T00:00:0${id.length % 10}Z`,
  state: 'Repairing',
  configHash: 'c'.repeat(64),
  appliedDefense: 'owner-only',
  badges: { reproduction: { achieved: true, runId: 'r1', at: '2026-10-12T00:00:00Z' }, defense: { achieved: false }, understanding: { achieved: false } },
  lastVerification: {
    runId: 'r2',
    attemptId: id,
    configHash: 'c'.repeat(64),
    outcomes: [{ testId: 't', title: 'テスト', group: 'attack', passed: false, expected: 'status 403', actual: 'status 200' }],
    passed: false,
    startedAt: '2026-10-12T00:00:00Z',
    elapsedMs: 12,
  },
  hintsOpened: [1],
  solutionViewed: false,
  answers: { q1: 'owner' },
  ...overrides,
});

describe('ProgressStore', () => {
  it('保存・一覧・削除ができ、書き出した JSON を別の環境へ復元できる（A15）', async () => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('a1'));
    await store.save(attempt('a2'));
    await store.save(attempt('a1', { state: 'Passed' }));
    expect((await store.list()).map((a) => [a.attemptId, a.state])).toEqual([
      ['a1', 'Passed'],
      ['a2', 'Repairing'],
    ]);

    const json = await store.exportJson(new Date('2026-10-12T09:00:00Z'));
    expect(JSON.parse(json)).toMatchObject({ format: PROGRESS_FORMAT, schemaVersion: 1, exportedAt: '2026-10-12T09:00:00.000Z' });

    const restored = ProgressStore.inMemory();
    expect(await restored.importJson(json)).toEqual({ ok: true, imported: 2 });
    expect(await restored.list()).toEqual(await store.list());

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it.each([
    ['JSON でない', () => 'not json', /JSON として読み込めません/],
    ['形式が違う', () => JSON.stringify({ format: 'other', schemaVersion: 1, exportedAt: '', attempts: [] }), /PatchQuest の進捗ファイルではありません/],
    ['版が違う', () => JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 2, exportedAt: '', attempts: [] }), /対応していない版/],
    ['大きすぎる', () => ' '.repeat(MAX_PROGRESS_BYTES + 1), /大きすぎます/],
    [
      '項目の型が違う',
      () => JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 1, exportedAt: '', attempts: [{ ...attempt('x'), seed: 'NaN' }] }),
      /attempts\[0\]\.seed: 数値が必要です/,
    ],
    [
      '未知の状態',
      () => JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 1, exportedAt: '', attempts: [{ ...attempt('x'), state: 'Hacked' }] }),
      /attempts\[0\]\.state/,
    ],
  ])('%s進捗 JSON は拒否し、既存の進捗を失わない（A16）', async (_, make, message) => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('keep'));
    const result = await store.importJson(make());
    expect(result).toEqual({ ok: false, error: expect.stringMatching(message) });
    expect((await store.list()).map((a) => a.attemptId)).toEqual(['keep']);
  });

  it('既知の項目だけを取り込み、余分な値は捨てる', async () => {
    const store = ProgressStore.inMemory();
    const tainted = { ...attempt('x'), extra: '<script>', badges: { ...attempt('x').badges, reproduction: { achieved: true, injected: 1 } } };
    await store.importJson(JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 1, exportedAt: '', attempts: [tainted] }));
    const [restored] = await store.list();
    expect(restored).not.toHaveProperty('extra');
    expect(restored?.badges.reproduction).toEqual({ achieved: true });
  });

  it('保存できない環境では理由を返し、メモリで続ける', async () => {
    const store = ProgressStore.inMemory('ブラウザに保存できません（テスト）');
    await store.save(attempt('m1'));
    expect(store.unavailableReason).toMatch(/保存できません/);
    expect(await store.list()).toHaveLength(1);
  });
});

describe('matchesCurrentVersion', () => {
  it('パック版とレシピ版が現在の教材と一致するときだけ現在の記録とみなす', () => {
    expect(matchesCurrentVersion(attempt('a'), testPack)).toBe(true);
    expect(matchesCurrentVersion(attempt('a', { missionVersion: '0.9.0' }), testPack)).toBe(false);
    expect(matchesCurrentVersion(attempt('a', { recipeVersion: '0.1.0' }), testPack)).toBe(false);
    expect(matchesCurrentVersion(attempt('a'), undefined)).toBe(false);
  });
});
