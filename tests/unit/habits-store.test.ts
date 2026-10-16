// 復習の回答と週間目標の保存・検証・取り込みを確かめる。記録から導けない項目なので、XP の照合で消えずに残る。
import { describe, expect, it } from 'vitest';
import type { ReviewEntry } from '../../platform/progress/review';
import { MAX_REVIEWS, REVIEW_XP } from '../../platform/progress/review';
import { parseProgress, ProgressFormatError } from '../../platform/progress/schema';
import { ProgressStore } from '../../platform/progress/store';
import { makeAttempt } from '../support/attempt';

const json = (profile: unknown, schemaVersion = 8) => JSON.stringify({ format: 'patchquest-progress', schemaVersion, exportedAt: '', profile, attempts: [] });
const local = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const review = (day: number, questionId = 'q1', correct = true): ReviewEntry => ({ at: local(day), missionId: 'test-pack', questionId, correct });
const reached = () => makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } });

describe('進捗ファイルの検証', () => {
  it('復習の回答と週間目標は省略でき、正しい形なら読み込む', () => {
    expect(parseProgress(json({})).profile).toEqual({});
    const profile = parseProgress(json({ reviews: [review(12)], weeklyGoal: 'few' })).profile;
    expect(profile).toEqual({ reviews: [review(12)], weeklyGoal: 'few' });
  });

  it.each([
    ['回答が配列でない', { reviews: {} }],
    ['回答の日時が文字列でない', { reviews: [{ ...review(12), at: 1 }] }],
    ['回答の課題 ID が空', { reviews: [{ ...review(12), missionId: '' }] }],
    ['回答の設問 ID がない', { reviews: [{ at: local(12), missionId: 'test-pack', correct: true }] }],
    ['正誤が真偽値でない', { reviews: [{ ...review(12), correct: 'yes' }] }],
    ['週間目標が選択肢にない', { weeklyGoal: 'daily' }],
    ['週間目標が null', { weeklyGoal: null }],
  ])('%s進捗 JSON は拒否する', (_, profile) => {
    expect(() => parseProgress(json(profile))).toThrow(ProgressFormatError);
  });

  it('回答が上限を超えたら新しい分だけを残す', () => {
    const reviews = Array.from({ length: MAX_REVIEWS + 5 }, (_, index) => review(12, `q${index}`));
    const kept = parseProgress(json({ reviews })).profile.reviews;
    expect(kept).toHaveLength(MAX_REVIEWS);
    expect(kept?.[0]?.questionId).toBe('q5');
  });
});

describe('ProgressStore の復習と週間目標', () => {
  it('回答を追記すると XP に反映し、記録の照合で消えずに書き出しへ残る', async () => {
    const store = ProgressStore.inMemory();
    await store.save(reached());
    const summary = await store.recordReview(review(12));
    expect(summary.reviews).toEqual([review(12)]);
    expect(summary.xp).toMatchObject({ total: 10 + REVIEW_XP, review: REVIEW_XP });
    await store.recordReview(review(12, 'q2'));
    const after = await store.profile(await store.list());
    expect(after.xp.total).toBe(10 + REVIEW_XP);
    expect(after.reviews).toHaveLength(2);
    expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 10 + REVIEW_XP }, achievements: {}, reviews: after.reviews });
  });

  it('週間目標を選ぶと保存し、設定しないに戻すと項目ごと消える', async () => {
    const store = ProgressStore.inMemory();
    expect((await store.setWeeklyGoal('once')).weeklyGoal).toBe('once');
    expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 0 }, achievements: {}, weeklyGoal: 'once' });
    expect((await store.setWeeklyGoal(null)).weeklyGoal).toBeNull();
    expect(parseProgress(await store.exportJson()).profile).toEqual({ xp: { total: 0 }, achievements: {} });
  });

  it('書き出したファイルの XP は復習の分を含み、取り込んでも計算し直しにならない', async () => {
    const store = ProgressStore.inMemory();
    await store.save(reached());
    await store.recordReview(review(12));
    const restored = ProgressStore.inMemory();
    expect(await restored.importJson(await store.exportJson())).toEqual({ ok: true, imported: 1, profileRecomputed: false });
    const summary = await restored.profile(await restored.list());
    expect(summary).toMatchObject({ reviews: [review(12)], xp: { total: 10 + REVIEW_XP } });
  });

  it('取り込みでは回答を重ねずに合わせ、週間目標は手元の選択を優先する', async () => {
    const store = ProgressStore.inMemory();
    await store.recordReview(review(13, 'q2'));
    await store.setWeeklyGoal('few');
    const result = await store.importJson(json({ reviews: [review(12), review(13, 'q2')], weeklyGoal: 'once' }));
    expect(result).toEqual({ ok: true, imported: 0, profileRecomputed: false });
    const summary = await store.profile(await store.list());
    expect(summary.reviews).toEqual([review(12), review(13, 'q2')]);
    expect(summary.weeklyGoal).toBe('few');
  });

  it('手元に週間目標がなければ取り込んだ選択を使う', async () => {
    const store = ProgressStore.inMemory();
    await store.importJson(json({ weeklyGoal: 'once' }));
    expect((await store.profile(await store.list())).weeklyGoal).toBe('once');
  });

  it('削除すると回答と週間目標も消える', async () => {
    const store = ProgressStore.inMemory();
    await store.recordReview(review(12));
    await store.setWeeklyGoal('once');
    await store.clear();
    expect(await store.profile(await store.list())).toMatchObject({ reviews: [], weeklyGoal: null, xp: { total: 0 } });
  });
});
