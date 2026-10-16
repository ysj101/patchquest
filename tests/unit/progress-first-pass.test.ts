// 初回合格の固定記録の検証と、旧JSON・IndexedDBの同じ補完を確かめる。
import { afterEach, expect, it, vi } from 'vitest';
import { completeAttempt, type AttemptRecord } from '../../platform/contract';
import { parseProgress, PROGRESS_SCHEMA_VERSION } from '../../platform/progress/schema';
import { MemoryBackend, ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';

const at = '2026-10-16T00:00:00Z';
const entry = (passed: boolean, broken = false) => ({
  runId: '検証', at, defenseId: null, passed, undetermined: 0,
  groups: { attack: { passed: 0, total: 0 }, normal: { passed: broken ? 0 : 1, total: 1 }, regression: { passed: 0, total: 0 } },
});
const source = (record: unknown, schemaVersion = PROGRESS_SCHEMA_VERSION) => JSON.stringify({
  format: 'patchquest-progress', schemaVersion, exportedAt: at, profile: {}, attempts: [record],
});
type Facts = 'firstPass' | 'verifications' | 'normalBroken';
function legacy() {
  const record: Omit<AttemptRecord, Facts> & Partial<Pick<AttemptRecord, Facts>> = makeAttempt('旧記録', {
    history: [entry(false, true), entry(true), entry(false)], hintsOpened: [1],
  });
  delete record.firstPass;
  delete record.verifications;
  delete record.normalBroken;
  return record;
}

afterEach(() => vi.restoreAllMocks());

it.each([1, 2, 3, 4, 5, 6])('v%sは最初の合格までの事実を履歴から補完する', (version) => {
  const record = legacy();
  expect(parseProgress(source(record, version)).attempts[0]).toMatchObject({
    firstPass: { at, verifications: 2, normalBroken: true, hintsUsed: true }, verifications: 3, normalBroken: true,
  });
});

it('旧IndexedDBとJSONは同じ補完を使い、補完後のv7を往復しても初回合格を保つ', async () => {
  const record = legacy();
  vi.spyOn(MemoryBackend.prototype, 'getAll').mockResolvedValue([record as ReturnType<typeof makeAttempt>]);
  const store = ProgressStore.inMemory();
  const [restored] = await store.list();
  expect(restored).toEqual(parseProgress(source(record, 6)).attempts[0]);
  expect(parseProgress(source(restored)).attempts[0]).toEqual(restored);
});

it('合格履歴がない旧記録はnull、判定不能は正常系の失敗にせず、解法閲覧も補完する', () => {
  const record = legacy();
  record.history = [entry(false)];
  expect(completeAttempt(record)).toMatchObject({ firstPass: null, verifications: 1, normalBroken: false });
  record.history.push(entry(true));
  record.hintsOpened = [];
  record.solutionViewed = true;
  record.history[0] = { ...entry(false), undetermined: 1, groups: { ...entry(false).groups, normal: { passed: 0, total: 0 } } };
  expect(completeAttempt(record).firstPass).toEqual({ at, verifications: 2, normalBroken: false, hintsUsed: true });
});

it('明示的なnullや固定済みの初回合格を現在の履歴・閲覧記録で上書きしない', () => {
  const record = makeAttempt('新記録', { history: [entry(true)] });
  expect(completeAttempt(record).firstPass).toBeNull();
  record.firstPass = { at, verifications: 101, normalBroken: true, hintsUsed: false };
  record.hintsOpened = [1];
  record.verifications = 200;
  expect(parseProgress(source(record)).attempts[0]).toEqual(record);
});

it.each([
  { firstPass: '不正' }, { firstPass: { at, verifications: 0, normalBroken: false, hintsUsed: false } },
  { firstPass: { at, verifications: 1.5, normalBroken: false, hintsUsed: false } },
  { firstPass: { at: 1, verifications: 1, normalBroken: false, hintsUsed: false } },
  { firstPass: { at, verifications: 1, normalBroken: '不正', hintsUsed: false } },
  { firstPass: { at, verifications: 1, normalBroken: false, hintsUsed: 1 } },
  { firstPass: undefined }, { verifications: -1 }, { normalBroken: 1 },
])('v7の不正な検証記録を拒否する（%s）', (override) => {
  expect(() => parseProgress(source({ ...makeAttempt('不正'), ...override }))).toThrow();
});
