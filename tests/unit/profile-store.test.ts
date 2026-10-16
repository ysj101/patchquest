// XP と実績の保存値を照合し、進捗記録から復元できることを確かめる。
import { afterEach, expect, it, vi } from 'vitest';
import { parseProgress, ProgressFormatError } from '../../platform/progress/schema';
import { MemoryBackend, ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';

afterEach(() => vi.restoreAllMocks());

const json = (profile: unknown, schemaVersion = 7) => JSON.stringify({
  format: 'patchquest-progress', schemaVersion, exportedAt: '', profile, attempts: [],
});

it.each([1, 2, 3, 4, 5])('v%s のXPなしを維持して読み込む', (version) => {
  expect(parseProgress(json(version === 1 ? undefined : {}, version)).profile).toEqual({});
});

it.each([-1, 0.5, '100', null, undefined])('XP合計が非負整数でない%sは拒否する', (total) => {
  expect(() => parseProgress(json({ xp: { total } }))).toThrow(ProgressFormatError);
});

it('記録から計算した値だけを返し、v7を往復して照合する', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.profile(await store.list())).toMatchObject({ xp: { total: 10 } });
  const restored = ProgressStore.inMemory();
  expect(await restored.importJson(await store.exportJson())).toMatchObject({ profileRecomputed: false });
  expect(await restored.profile(await restored.list())).toMatchObject({ xp: { total: 10 } });
});

it('改変値を取り込むと記録から計算し、既存記録も合算して保存する', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.importJson(json({ xp: { total: 999 } }))).toMatchObject({ profileRecomputed: true });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 10 }, achievements: {} });
  await store.save(makeAttempt('別の課題', { missionId: '別', milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.profile(await store.list())).toMatchObject({ xp: { total: 20 } });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 20 }, achievements: {} });
});


it('一覧で取得済みの記録を使い、二度読みせず古い保存値を黙って更新する', async () => {
  const store = ProgressStore.inMemory();
  await store.profile(await store.list());
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  const records = await store.list();
  const list = vi.spyOn(store, 'list');
  const summary = await store.profile(records);
  expect(summary.xp).toEqual({ total: 10, level: 1, nextLevelAt: 100, byMission: { 'test-pack': { stages: 10, retries: 0 } }, review: 0 });
  expect(list).not.toHaveBeenCalled();
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 10 }, achievements: {} });
});

it('別端末の整合したファイルはローカルと合算しても警告しない', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('ローカル', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  const other = ProgressStore.inMemory();
  await other.save(makeAttempt('別端末', { missionId: '別課題', milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  await other.profile(await other.list());
  expect(await store.importJson(await other.exportJson())).toMatchObject({ profileRecomputed: false });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 20 }, achievements: {} });
});

it('版にかかわらず既知の実績だけ読み込み、不正な日時の型を拒否する', () => {
  expect(parseProgress(json({ achievements: { 'first-defense': '日時', unknown: 12 } })).profile).toEqual({ achievements: { 'first-defense': '日時' } });
  for (const version of [1, 2, 3, 4, 5]) {
    expect(parseProgress(json({ achievements: { 'first-defense': '日時' } }, version)).profile).toEqual(version === 1 ? {} : { achievements: { 'first-defense': '日時' } });
  }
  expect(() => parseProgress(json({ achievements: { 'first-defense': 12 } }))).toThrow(ProgressFormatError);
  expect(() => parseProgress(json({ achievements: { 'first-defense': '長'.repeat(5000) } }))).toThrow(ProgressFormatError);
});

it('実績の集合を取り込み元だけで照合し、日時の違いは通知せず正しい日時を保存する', async () => {
  const store = ProgressStore.inMemory();
  const record = makeAttempt('再現');
  record.badges.reproduction = { achieved: true, at: '2026-10-12T01:00:00Z' };
  await store.save(record);
  await store.profile(await store.list());
  const source = JSON.parse(await store.exportJson()) as { profile: { achievements: Record<string, string> } };
  source.profile.achievements['first-reproduction'] = '改変した日時';
  expect(await store.importJson(JSON.stringify(source))).toMatchObject({ profileRecomputed: false });
  expect(parseProgress(await store.exportJson()).profile.achievements).toEqual({ 'first-reproduction': record.badges.reproduction.at });
  source.profile.achievements['first-defense'] = '架空の解除';
  expect(await store.importJson(JSON.stringify(source))).toMatchObject({ profileRecomputed: true });
  expect(await store.importJson(json({ achievements: {} }))).toMatchObject({ profileRecomputed: false });
});

it('XPと実績の差分は一度だけ保存し、同じ記録の再取得では書き直さない', async () => {
  const store = ProgressStore.inMemory();
  const record = makeAttempt('再現');
  record.badges.reproduction = { achieved: true, at: '2026-10-12T01:00:00Z' };
  await store.save(record);
  const put = vi.spyOn(MemoryBackend.prototype, 'putProfile');
  await store.profile(await store.list());
  expect(put).toHaveBeenCalledExactlyOnceWith({ xp: { total: 30 }, achievements: { 'first-reproduction': record.badges.reproduction.at } });
  await store.profile(await store.list());
  expect(put).toHaveBeenCalledTimes(1);
});

it('渡した課題一覧をprofileと取り込みの両方に使い、全課題の解除も再計算する', async () => {
  const options = { missionIds: ['test-pack'], categories: {} };
  const store = ProgressStore.inMemory(options);
  const record = makeAttempt('完了');
  record.badges = { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } };
  await store.save(record);
  expect((await store.profile(await store.list())).achievements).toHaveProperty('all-missions', record.createdAt);
  const other = ProgressStore.inMemory(options);
  expect(await other.importJson(await store.exportJson())).toMatchObject({ profileRecomputed: false });
  expect(parseProgress(await other.exportJson()).profile.achievements).toHaveProperty('all-missions', record.createdAt);
  const changed = { missionIds: [record.missionId, '追加課題'], categories: {} };
  const changedStore = ProgressStore.inMemory(changed);
  expect(await changedStore.importJson(await store.exportJson())).toMatchObject({ profileRecomputed: true });
  expect(parseProgress(await changedStore.exportJson()).profile.achievements).not.toHaveProperty('all-missions');
});

it('profileのキーの順序が違っても同じ内容なら保存し直さない', async () => {
  const store = ProgressStore.inMemory();
  const record = makeAttempt('防御', { firstPass: { at: '日時', verifications: 2, normalBroken: true, hintsUsed: true } });
  record.badges.defense = { achieved: true, at: '日時' };
  await store.save(record);
  await store.profile(await store.list());
  const saved = parseProgress(await store.exportJson()).profile;
  vi.spyOn(MemoryBackend.prototype, 'getProfile').mockResolvedValue({ achievements: saved.achievements, xp: saved.xp });
  const put = vi.spyOn(MemoryBackend.prototype, 'putProfile');
  await store.profile(await store.list());
  expect(put).not.toHaveBeenCalled();
});
