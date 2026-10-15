// 進捗ファイルの互換性・検証・保存と復元を確かめる。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptRecord } from '../../platform/contract';
import { MAX_PROGRESS_BYTES, PROGRESS_FORMAT, PROGRESS_SCHEMA_VERSION, ProgressFormatError, parseProgress } from '../../platform/progress/schema';
import { IndexedDbBackend, ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';


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

/** 型が不正な項目も渡せる進捗 JSON。profile: undefined で旧版と同じく項目を省ける。 */
function progressJson(options: {
  format?: string;
  schemaVersion?: unknown;
  attempts?: unknown[];
  profile?: unknown;
} = {}): string {
  return JSON.stringify({
    format: PROGRESS_FORMAT,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    exportedAt: '',
    attempts: [],
    profile: {},
    ...options,
  });
}

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
    expect(JSON.parse(json)).toMatchObject({ format: PROGRESS_FORMAT, schemaVersion: 2, profile: {}, exportedAt: '2026-10-12T09:00:00.000Z' });

    const restored = ProgressStore.inMemory();
    expect(await restored.importJson(json)).toEqual({ ok: true, imported: 2 });
    expect(await restored.list()).toEqual(await store.list());

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it.each([
    ['JSON でない', () => 'not json', /JSON として読み込めません/],
    ['形式が違う', () => progressJson({ format: 'other', schemaVersion: 1, profile: undefined }), /PatchQuest の進捗ファイルではありません/],
    ['版が違う', () => progressJson({ schemaVersion: 3 }), /対応していない版.*対応: 1〜2/],
    ['大きすぎる', () => ' '.repeat(MAX_PROGRESS_BYTES + 1), /大きすぎます/],
    [
      '項目の型が違う',
      () => progressJson({ schemaVersion: 1, profile: undefined, attempts: [{ ...attempt('x'), seed: 'NaN' }] }),
      /attempts\[0\]\.seed: 数値が必要です/,
    ],
    [
      '未知の状態',
      () => progressJson({ schemaVersion: 1, profile: undefined, attempts: [{ ...attempt('x'), state: 'Hacked' }] }),
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
    await store.importJson(progressJson({ schemaVersion: 1, profile: undefined, attempts: [tainted] }));
    const [restored] = await store.list();
    expect(restored).not.toHaveProperty('extra');
    expect(restored?.badges.reproduction).toEqual({ achieved: true });
  });

  it('v1 を v2 に変換し、達成印を保って同じ記録を置き換える', async () => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('旧版', { state: 'Passed' }));
    const legacy = progressJson({ schemaVersion: 1, profile: undefined, attempts: [attempt('旧版')] });
    expect(parseProgress(legacy)).toMatchObject({ schemaVersion: 2, profile: {} });
    expect(await store.importJson(legacy)).toEqual({ ok: true, imported: 1 });
    expect(await store.list()).toEqual([attempt('旧版')]);
    expect(parseProgress(await store.exportJson()).attempts[0]?.badges).toEqual(attempt('旧版').badges);
  });

  it.each([0, -1, 3, 1.5, '2', null, true])('未対応の版 %s は理由を示し既存進捗を変えない', async (version) => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('保持'));
    const before = await store.exportJson(new Date(0));
    const invalid = progressJson({ schemaVersion: version });
    expect(() => parseProgress(invalid)).toThrow(ProgressFormatError);
    expect(await store.importJson(invalid)).toEqual({ ok: false, error: 'schemaVersion: 対応していない版です（対応: 1〜2）' });
    expect(await store.exportJson(new Date(0))).toBe(before);
  });

  it.each([undefined, null, [], '不正', 1, false].map((value) => [value]))('profile がオブジェクトでない場合は拒否して進捗を保つ（%s）', async (profile) => {
    const store = ProgressStore.inMemory();
    await store.save(attempt('保持'));
    const result = await store.importJson(progressJson({ profile }));
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error', expect.stringMatching(/profile: オブジェクトが必要です/));
    expect(await store.list()).toEqual([attempt('保持')]);
  });

  it('profile の未知の項目を捨て、別の保存先へ復元して削除できる', async () => {
    const store = ProgressStore.inMemory();
    const source = progressJson({ attempts: [attempt('新形式')], profile: { xp: 999, stage: '未知' } });
    expect(await store.importJson(source)).toEqual({ ok: true, imported: 1 });
    const exported = await store.exportJson();
    expect(parseProgress(exported)).toMatchObject({ schemaVersion: 2, profile: {} });
    const restored = ProgressStore.inMemory();
    expect(await restored.importJson(exported)).toEqual({ ok: true, imported: 1 });
    expect(await restored.list()).toEqual([attempt('新形式')]);
    await restored.clear();
    expect(parseProgress(await restored.exportJson())).toMatchObject({ attempts: [], profile: {} });
  });

  it('保存できない環境では理由を返し、メモリで続ける', async () => {
    const store = ProgressStore.inMemory('ブラウザに保存できません（テスト）');
    await store.save(attempt('m1'));
    expect(store.unavailableReason).toMatch(/保存できません/);
    expect(await store.list()).toHaveLength(1);
  });
});

/** 更新通知を発火させ、作成する store と版を観察する。 */
async function openDatabase(oldVersion: number, blocked = false) {
  const createObjectStore = vi.fn<(name: string, options?: IDBObjectStoreParameters) => void>();
  const close = vi.fn<() => void>();
  const database = { createObjectStore, close } as unknown as IDBDatabase;
  const request = { result: database } as IDBOpenDBRequest;
  const open = vi.fn(() => {
    queueMicrotask(() => {
      if (blocked) {
        request.onblocked?.call(request, { oldVersion } as IDBVersionChangeEvent);
        return;
      }
      request.onupgradeneeded?.call(request, { oldVersion } as IDBVersionChangeEvent);
      request.onsuccess?.call(request, new Event('success'));
    });
    return request;
  });
  const backend = await IndexedDbBackend.open({ open } as unknown as IDBFactory);
  return { backend, open, createObjectStore, database, close };
}

afterEach(() => vi.restoreAllMocks());

describe('進捗の保存先', () => {
  it.each([
    [0, ['attempts', 'profile']],
    [1, ['profile']],
  ] as const)('DB の旧版 %s に応じて必要な store を追加する', async (oldVersion, expected) => {
    const database = await openDatabase(oldVersion);
    expect(database.open).toHaveBeenCalledWith('patchquest', 2);
    expect(database.createObjectStore.mock.calls.map(([name]) => name)).toEqual(expected);
  });

  it('別タブが DB 更新を妨げる場合は理由付きで拒否し、メモリで続ける', async () => {
    const failure: unknown = await openDatabase(1, true).catch((error: unknown) => error);
    const message = 'ほかのタブで PatchQuest が開いているため、保存領域を更新できません。ほかのタブを閉じてから再読み込みしてください';
    expect(failure).toEqual(new Error(message));
    vi.spyOn(IndexedDbBackend, 'open').mockRejectedValue(failure);
    const store = await ProgressStore.open();
    expect(store.unavailableReason).toBe(`ブラウザに保存できません（${message}）`);
    await store.save(attempt('メモリ継続'));
    expect(await store.list()).toEqual([attempt('メモリ継続')]);
  });

  it('開いた DB は別タブから版変更を求められたら接続を閉じる', async () => {
    const { database, close } = await openDatabase(1);
    expect(database.onversionchange).toBeTypeOf('function');
    database.onversionchange?.call(database, { oldVersion: 2, newVersion: 3 } as IDBVersionChangeEvent);
    expect(close).toHaveBeenCalledOnce();
  });

  it('接続を閉じた後の同期例外でもメモリに切り替えて保存を続ける', async () => {
    const { backend, database } = await openDatabase(1);
    vi.spyOn(IndexedDbBackend, 'open').mockResolvedValue(backend);
    const fail = () => { throw new Error('保存領域の接続は閉じています'); };
    vi.spyOn(backend, 'put').mockImplementation(fail);
    vi.spyOn(backend, 'getAll').mockImplementation(fail);
    vi.spyOn(backend, 'getProfile').mockImplementation(fail);
    const store = await ProgressStore.open();
    database.onversionchange?.call(database, { oldVersion: 2, newVersion: 3 } as IDBVersionChangeEvent);
    await store.save(attempt('接続終了後'));
    expect(store.unavailableReason).toBe('ブラウザに保存できなくなりました（保存領域の接続は閉じています）');
    expect(await store.list()).toEqual([attempt('接続終了後')]);
  });

  it('profile の保存が失敗したら記録を引き継ぎ、メモリで取り込みを完了する', async () => {
    const { backend } = await openDatabase(1);
    vi.spyOn(IndexedDbBackend, 'open').mockResolvedValue(backend);
    vi.spyOn(backend, 'getAll').mockResolvedValue([attempt('保持')]);
    vi.spyOn(backend, 'getProfile').mockResolvedValue({});
    vi.spyOn(backend, 'put').mockResolvedValue();
    vi.spyOn(backend, 'putProfile').mockRejectedValue(new Error('保存不可'));
    const store = await ProgressStore.open();
    const source = progressJson({ attempts: [attempt('追加')] });
    expect(await store.importJson(source)).toEqual({ ok: true, imported: 1 });
    expect(store.unavailableReason).toMatch(/保存不可/);
    expect((await store.list()).map((record) => record.attemptId)).toEqual(['保持', '追加']);
    expect(parseProgress(await store.exportJson()).profile).toEqual({});
  });
});
