import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../platform/contract';
import { MAX_ATTEMPTS, MAX_PROGRESS_BYTES, MAX_TEXT, PROGRESS_FORMAT } from '../../platform/progress/schema';
import { IndexedDbBackend, ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';
import { createFakeIndexedDb } from '../support/fake-idb';


/** 検証結果や達成印を持つ、取り込みの検証に使う記録 */
const attempt = (id: string, overrides: Partial<AttemptRecord> = {}): AttemptRecord =>
  makeAttempt(id, {
    createdAt: `2026-10-12T00:00:0${id.length % 10}Z`,
    state: 'Repairing',
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
    expect(JSON.parse(json)).toMatchObject({
      format: PROGRESS_FORMAT,
      schemaVersion: 2,
      exportedAt: '2026-10-12T09:00:00.000Z',
      profile: { entries: [] },
    });

    const restored = ProgressStore.inMemory();
    expect(await restored.importJson(json)).toEqual({ ok: true, imported: 2 });
    expect(await restored.list()).toEqual(await store.list());

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it.each([
    ['JSON でない', () => 'not json', /JSON として読み込めません/],
    ['形式が違う', () => JSON.stringify({ format: 'other', schemaVersion: 1, exportedAt: '', attempts: [] }), /PatchQuest の進捗ファイルではありません/],
    ['版が違う', () => JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 3, exportedAt: '', attempts: [] }), /対応していない版/],
    [
      'profile がない',
      () => JSON.stringify({ format: PROGRESS_FORMAT, schemaVersion: 2, exportedAt: '', attempts: [] }),
      /profile: オブジェクトが必要です/,
    ],
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
    expect(JSON.parse(await store.exportJson())).toMatchObject({ schemaVersion: 2, profile: { entries: [] } });
  });

  it('schemaVersion 1 の進捗を取り込むと 2 へ変換し、達成印を残す', async () => {
    const store = ProgressStore.inMemory();
    const source = attempt('badge');
    await store.importJson(
      JSON.stringify({
        format: PROGRESS_FORMAT,
        schemaVersion: 2,
        exportedAt: '',
        attempts: [],
        profile: { entries: [{ id: 'kept-entry' }] },
      }),
    );
    const imported = await store.importJson(
      JSON.stringify({
        format: PROGRESS_FORMAT,
        schemaVersion: 1,
        exportedAt: '2026-10-12T09:00:00.000Z',
        attempts: [source],
        profile: { entries: [{ id: 'ignored-because-v1' }] },
      }),
    );
    expect(imported).toEqual({ ok: true, imported: 1 });
    const [restored] = await store.list();
    expect(restored?.badges).toEqual(source.badges);
    expect(JSON.parse(await store.exportJson(new Date('2026-10-12T09:00:00Z')))).toMatchObject({
      format: PROGRESS_FORMAT,
      schemaVersion: 2,
      exportedAt: '2026-10-12T09:00:00.000Z',
      profile: { entries: [{ id: 'kept-entry' }] },
      attempts: [{ attemptId: 'badge', badges: source.badges }],
    });
  });

  it.each([0, 3])('schemaVersion %s は拒否し、既存の進捗を失わない（A16）', async (version) => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('keep'));
    await store.importJson(
      JSON.stringify({
        format: PROGRESS_FORMAT,
        schemaVersion: 2,
        exportedAt: '',
        attempts: [],
        profile: { entries: [{ id: 'kept-entry' }] },
      }),
    );
    const result = await store.importJson(
      JSON.stringify({
        format: PROGRESS_FORMAT,
        schemaVersion: version,
        exportedAt: '',
        attempts: [attempt('other')],
        profile: { entries: [{ id: 'new-entry' }] },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/対応していない版/);
    expect((await store.list()).map((item) => item.attemptId)).toEqual(['keep']);
    expect(profileOf(await store.exportJson())).toEqual({ entries: [{ id: 'kept-entry' }] });
  });

  it('profile の件数や文字列が上限を超える進捗は拒否し、既存の進捗を失わない（A16）', async () => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('keep'));
    const atLimit = {
      format: PROGRESS_FORMAT,
      schemaVersion: 2,
      exportedAt: '',
      attempts: [] as unknown[],
      profile: { entries: [{ id: 'x'.repeat(MAX_TEXT) }] },
    };
    expect(await store.importJson(JSON.stringify(atLimit))).toEqual({ ok: true, imported: 0 });

    const tooLong = { ...atLimit, profile: { entries: [{ id: 'x'.repeat(MAX_TEXT + 1) }] } };
    const tooMany = {
      ...atLimit,
      profile: { entries: Array.from({ length: MAX_ATTEMPTS + 1 }, (_, index) => ({ id: String(index) })) },
    };
    const longResult = await store.importJson(JSON.stringify(tooLong));
    const manyResult = await store.importJson(JSON.stringify(tooMany));
    expect(longResult.ok).toBe(false);
    expect(manyResult.ok).toBe(false);
    if (!longResult.ok) expect(longResult.error).toMatch(/profile\.entries\[0\]\.id: 4096 文字以内/);
    if (!manyResult.ok) expect(manyResult.error).toMatch(/profile\.entries: 1000 件以内/);
    expect((await store.list()).map((item) => item.attemptId)).toEqual(['keep']);
    expect(profileOf(await store.exportJson())).toEqual(atLimit.profile);
  });

  it('profile は既知の項目だけを取り込み、削除すると空に戻る', async () => {
    const store = ProgressStore.inMemory();
    const file = {
      format: PROGRESS_FORMAT,
      schemaVersion: 2,
      exportedAt: '',
      attempts: [attempt('a1')],
      profile: { entries: [{ id: 'ach-1', extra: true }], unknown: 1 },
    };
    expect(await store.importJson(JSON.stringify(file))).toEqual({ ok: true, imported: 1 });
    expect(profileOf(await store.exportJson())).toEqual({ entries: [{ id: 'ach-1' }] });
    await store.clear();
    expect(await store.list()).toEqual([]);
    expect(profileOf(await store.exportJson())).toEqual({ entries: [] });
  });
});

function profileOf(text: string): unknown {
  const parsed: unknown = JSON.parse(text) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !('profile' in parsed)) throw new Error('profile がありません');
  return parsed.profile;
}

describe('IndexedDbBackend', () => {
  it('profile と attempts を新しい形式で保存し、開き直しても残る', async () => {
    const idb = createFakeIndexedDb();
    const first = await IndexedDbBackend.open(idb.factory);
    await first.put([attempt('saved')]);
    await first.putProfile({ entries: [{ id: 'stage-reach' }] });

    const reopened = await IndexedDbBackend.open(idb.factory);
    expect(await reopened.getAll()).toEqual([attempt('saved')]);
    expect(await reopened.getProfile()).toEqual({ entries: [{ id: 'stage-reach' }] });

    await reopened.clear();
    expect(await reopened.getAll()).toEqual([]);
    expect(await reopened.getProfile()).toEqual({ entries: [] });
  });

  it('attempts だけの旧データベースを開いても記録が残り、profile は空になる', async () => {
    const idb = createFakeIndexedDb();
    const legacy = attempt('legacy');
    idb.seedLegacy([legacy]);
    const backend = await IndexedDbBackend.open(idb.factory);
    expect(await backend.getAll()).toEqual([legacy]);
    expect(await backend.getProfile()).toEqual({ entries: [] });
  });
});
