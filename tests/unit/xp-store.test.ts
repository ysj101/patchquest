// XP の保存値を検証し、進捗記録から復元できることを確かめる。
import { expect, it, vi } from 'vitest';
import { parseProgress, ProgressFormatError } from '../../platform/progress/schema';
import { ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';

const json = (profile: unknown, schemaVersion = 5) => JSON.stringify({
  format: 'patchquest-progress', schemaVersion, exportedAt: '', profile, attempts: [],
});

it.each([1, 2, 3, 4])('v%s のXPなしを維持して読み込む', (version) => {
  expect(parseProgress(json(version === 1 ? undefined : {}, version)).profile).toEqual({});
});

it.each([-1, 0.5, '100', null, undefined])('XP合計が非負整数でない%sは拒否する', (total) => {
  expect(() => parseProgress(json({ xp: { total } }))).toThrow(ProgressFormatError);
});

it('記録から計算した値だけを返し、v5を往復して照合する', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.xp()).toMatchObject({ total: 10 });
  const restored = ProgressStore.inMemory();
  expect(await restored.importJson(await store.exportJson())).toMatchObject({ xpRecomputed: false });
  expect(await restored.xp()).toMatchObject({ total: 10 });
});

it('改変値を取り込むと記録から計算し、既存記録も合算して保存する', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.importJson(json({ xp: { total: 999 } }))).toMatchObject({ xpRecomputed: true });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 10 } });
  await store.save(makeAttempt('別の課題', { missionId: '別', milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  expect(await store.xp()).toMatchObject({ total: 20 });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 20 } });
});


it('一覧で取得済みの記録を使い、二度読みせず古い保存値を黙って更新する', async () => {
  const store = ProgressStore.inMemory();
  await store.xp();
  await store.save(makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  const records = await store.list();
  const list = vi.spyOn(store, 'list');
  const summary = await store.xp(records);
  expect(summary).toEqual({ total: 10, level: 1, nextLevelAt: 100, byMission: { 'test-pack': { stages: 10, retries: 0 } } });
  expect(list).not.toHaveBeenCalled();
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 10 } });
});

it('別端末の整合したファイルはローカルと合算しても警告しない', async () => {
  const store = ProgressStore.inMemory();
  await store.save(makeAttempt('ローカル', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  const other = ProgressStore.inMemory();
  await other.save(makeAttempt('別端末', { missionId: '別課題', milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } }));
  await other.xp();
  expect(await store.importJson(await other.exportJson())).toMatchObject({ xpRecomputed: false });
  expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 20 } });
});
