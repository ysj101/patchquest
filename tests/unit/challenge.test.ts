// 別条件での挑戦の条件（seed・variant・設問）が、保存済みの記録から期待どおりに決まることを確かめる。
import { describe, expect, it } from 'vitest';
import { askedQuestions, type MissionPack } from '../../platform/contract';
import { planChallenge } from '../../platform/progress/challenge';
import { idorPack } from '../../missions/idor';
import { makeAttempt } from '../support/attempt';

const ids = idorPack.manifest.transferCheck.map((question) => question.id);
const [first, second, third, fourth] = ids as [string, string, string, string];
const record = (id: string, seed: number, createdAt: string, challenge: { questionIds: string[]; repeatsPrevious: boolean } | null = null) =>
  makeAttempt(id, { missionId: 'idor', seed, createdAt, challenge });

/** 呼ぶたびに順に返す乱数。衝突の引き直しを確かめる */
const sequence = (...values: number[]) => {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('乱数を使い切りました');
    return next;
  };
};

describe('planChallenge', () => {
  it('使ったことのない seed を引き直し、全問を出し終えていれば同じ設問を出し直すと知らせる', () => {
    const plan = planChallenge(idorPack, [record('a', 42, '2026-10-12T00:00:00Z')], sequence(42, 42, 7));
    expect(plan.seed).toBe(7);
    expect(plan.variantId).toBe('default');
    // 通常の演習は全問を出すので、どちらも 1 回ずつ出題済み。seed で 1 問選ぶ
    expect(plan.challenge).toEqual({ questionIds: [ids[7 % ids.length]], repeatsPrevious: true });
  });

  it('出題回数が少ない設問を選び、前回と違えば repeatsPrevious を false にする', () => {
    const records = [
      record('a', 42, '2026-10-12T00:00:00Z'),
      record('b', 7, '2026-10-12T01:00:00Z', { questionIds: [second], repeatsPrevious: true }),
      record('c', 8, '2026-10-12T02:00:00Z', { questionIds: [third], repeatsPrevious: false }),
      record('d', 9, '2026-10-12T03:00:00Z', { questionIds: [fourth], repeatsPrevious: false }),
    ];
    const plan = planChallenge(idorPack, records, sequence(100));
    expect(plan.challenge).toEqual({ questionIds: [first], repeatsPrevious: false });
  });

  it('旧版のパックで出した、いまの版にない設問は数えず、止めずに選ぶ', () => {
    const stale = record('old', 3, '2026-10-11T00:00:00Z', { questionIds: ['removed-question'], repeatsPrevious: false });
    const plan = planChallenge(idorPack, [stale, record('a', 42, '2026-10-12T00:00:00Z')], sequence(8));
    expect(plan.challenge).toEqual({ questionIds: [ids[8 % ids.length]], repeatsPrevious: true });
  });

  it('他の課題の記録は数えず、記録がなければ最初の variant と seed で選んだ設問になる', () => {
    const plan = planChallenge(idorPack, [makeAttempt('other', { missionId: 'sqli', seed: 5 })], sequence(5));
    expect(plan).toEqual({ variantId: 'default', seed: 5, challenge: { questionIds: [second], repeatsPrevious: false } });
  });

  it('variant が複数あれば前回の次を選び、末尾の次は先頭に戻る', () => {
    const variants = [{ id: 'v1', label: '1', recipe: 'no-owner-check' }, { id: 'v2', label: '2', recipe: 'no-owner-check' }];
    const pack: MissionPack = { ...idorPack, manifest: { ...idorPack.manifest, fixtures: { ...idorPack.manifest.fixtures, variants } } };
    expect(planChallenge(pack, [makeAttempt('a', { missionId: 'idor', variantId: 'v1' })], sequence(1)).variantId).toBe('v2');
    expect(planChallenge(pack, [makeAttempt('a', { missionId: 'idor', variantId: 'v2' })], sequence(1)).variantId).toBe('v1');
  });

  it('seed を引き直し続けるときと、設問のない課題では止める', () => {
    const used = [record('a', 1, '2026-10-12T00:00:00Z')];
    expect(() => planChallenge(idorPack, used, () => 1)).toThrow('新しい seed を選べませんでした');
    const noQuestions: MissionPack = { ...idorPack, manifest: { ...idorPack.manifest, transferCheck: [] } };
    expect(() => planChallenge(noQuestions, [], sequence(3))).toThrow('理解確認の設問がありません');
  });
});

describe('askedQuestions', () => {
  it('通常の演習は全問、チャレンジは記録の設問だけを返し、パックにない設問なら止める', () => {
    expect(askedQuestions(idorPack.manifest, { challenge: null })).toHaveLength(ids.length);
    expect(askedQuestions(idorPack.manifest, { challenge: { questionIds: [second], repeatsPrevious: false } }).map((question) => question.id)).toEqual([second]);
    expect(() => askedQuestions(idorPack.manifest, { challenge: { questionIds: ['missing'], repeatsPrevious: false } })).toThrow('チャレンジの設問（missing）がパックにありません');
  });
});
