// 復習クエストの出題の選び方と、復習の正答から導く少量の XP が繰り返しで増え続けないことを確かめる。
import { describe, expect, it } from 'vitest';
import type { MissionPack } from '../../platform/contract';
import { REVIEW_XP, pickReview, reviewCandidates, reviewXp, type ReviewEntry } from '../../platform/progress/review';
import { xpFromAttempts } from '../../platform/progress/xp';
import { makeAttempt } from '../support/attempt';
import { testPack } from '../support/test-pack';

const completed = (id: string, missionId = 'test-pack') => makeAttempt(id, {
  missionId,
  badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } },
});

/** 理解確認を差し替えた test-pack の写し */
function packWith(id: string, questionIds: string[], kind: MissionPack['manifest']['kind'] = 'mission'): MissionPack {
  const question = testPack.manifest.transferCheck[0];
  if (!question) throw new Error('test-pack に理解確認がありません');
  return { ...testPack, manifest: { ...testPack.manifest, id, kind, title: `課題 ${id}`, transferCheck: questionIds.map((questionId) => ({ ...question, id: questionId })) } };
}

/** ローカル時刻の日時を ISO 文字列にする（日の境目の判定が端末のタイムゾーンに依らないようにする） */
const local = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour).toISOString();

describe('reviewCandidates', () => {
  it('3 印そろった記録のある課題の理解確認だけを候補にし、練習と未完了の課題は出さない', () => {
    const packs = [packWith('done', ['q1', 'q2']), packWith('half', ['q3']), packWith('tutorial', ['q4'], 'tutorial')];
    const half = makeAttempt('途中', { missionId: 'half', badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: false } } });
    const candidates = reviewCandidates(packs, [completed('完了', 'done'), half, completed('練習', 'tutorial')]);
    expect(candidates.map((candidate) => [candidate.missionId, candidate.question.id, candidate.missionTitle])).toEqual([
      ['done', 'q1', '課題 done'],
      ['done', 'q2', '課題 done'],
    ]);
  });

  it('記録がなければ候補はなく、出題も null になる', () => {
    expect(reviewCandidates([packWith('done', ['q1'])], [])).toEqual([]);
    expect(pickReview([], undefined, () => 0)).toBeNull();
  });
});

describe('pickReview', () => {
  const candidates = reviewCandidates([packWith('done', ['q1', 'q2', 'q3'])], [completed('完了', 'done')]);

  it('乱数で候補から 1 問を選ぶ', () => {
    expect(pickReview(candidates, undefined, () => 0)?.question.id).toBe('q1');
    expect(pickReview(candidates, undefined, () => 0.99)?.question.id).toBe('q3');
  });

  it('直前に答えた設問は候補から外し、同じ問題を続けて出さない', () => {
    const previous: ReviewEntry = { at: local(2026, 10, 12), missionId: 'done', questionId: 'q1', correct: true };
    const picked = Array.from({ length: 10 }, (_, index) => pickReview(candidates, previous, () => index / 10)?.question.id);
    expect(picked).not.toContain('q1');
    expect(new Set(picked)).toEqual(new Set(['q2', 'q3']));
  });

  it('候補が直前の 1 問しかなければ、その問題をもう一度出す', () => {
    const only = reviewCandidates([packWith('done', ['q1'])], [completed('完了', 'done')]);
    const previous: ReviewEntry = { at: local(2026, 10, 12), missionId: 'done', questionId: 'q1', correct: false };
    expect(pickReview(only, previous, () => 0.5)?.question.id).toBe('q1');
  });

  it('別の課題の同じ設問 ID は別の問題として扱う', () => {
    const two = reviewCandidates([packWith('one', ['q1']), packWith('two', ['q1'])], [completed('a', 'one'), completed('b', 'two')]);
    const previous: ReviewEntry = { at: local(2026, 10, 12), missionId: 'one', questionId: 'q1', correct: true };
    expect(pickReview(two, previous, () => 0)?.missionId).toBe('two');
  });
});

describe('reviewXp', () => {
  const entry = (at: string, correct = true, questionId = 'q1'): ReviewEntry => ({ at, missionId: 'done', questionId, correct });

  it(`正解 1 回に ${REVIEW_XP} XP を与え、不正解には与えない`, () => {
    expect(reviewXp([])).toBe(0);
    expect(reviewXp([entry(local(2026, 10, 12))])).toBe(REVIEW_XP);
    expect(reviewXp([entry(local(2026, 10, 12), false)])).toBe(0);
  });

  it('同じ日の 2 回目以降の正解には与えず、別の日なら与える（繰り返しで増え続けない）', () => {
    const sameDay = [entry(local(2026, 10, 12, 9)), entry(local(2026, 10, 12, 18), true, 'q2'), entry(local(2026, 10, 12, 23), true, 'q3')];
    expect(reviewXp(sameDay)).toBe(REVIEW_XP);
    expect(reviewXp([...sameDay, entry(local(2026, 10, 13))])).toBe(REVIEW_XP * 2);
  });

  it('日時が読めない回答は数えない', () => {
    expect(reviewXp([entry('いつか')])).toBe(0);
  });

  it('演習の XP に復習の分を足し、内訳を review に示す', () => {
    const reviews = [entry(local(2026, 10, 12)), entry(local(2026, 10, 13))];
    const summary = xpFromAttempts([makeAttempt('到達', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } })], reviews);
    expect(summary).toMatchObject({ total: 10 + REVIEW_XP * 2, review: REVIEW_XP * 2 });
  });
});
