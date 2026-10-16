// 分類ごとの習熟度を演習記録から計算し、同じ条件の繰り返しで上がらず、根拠を説明できることを確かめる。
import { expect, it } from 'vitest';
import { masteryFromAttempts } from '../../platform/progress/mastery';
import { makeAttempt } from '../support/attempt';

const categories = { 'test-pack': 'authorization', xss: 'output-encoding' } as const;

const complete = (id: string, seed = 42, variantId = 'default', createdAt = '2026-10-12T00:00:00Z') => makeAttempt(id, {
  seed, variantId, createdAt,
  badges: { reproduction: { achieved: true, at: `${createdAt}再現` }, defense: { achieved: true, at: `${createdAt}防御` }, understanding: { achieved: true, at: `${createdAt}理解` } },
});

it('記録がなければ全分類が★0で根拠もない', () => {
  const summary = masteryFromAttempts([], categories);
  expect(summary.authorization).toEqual({ category: 'authorization', stars: 0, evidence: [] });
  expect(summary['output-encoding'].stars).toBe(0);
  expect(summary['data-access'].stars).toBe(0);
});

it('再現で★1、防御で★2、三つそろって★3になり、根拠に達成の種類と演習を残す', () => {
  const record = makeAttempt('演習');
  expect(masteryFromAttempts([record], categories).authorization.stars).toBe(0);
  record.badges.reproduction = { achieved: true, at: '2026-10-12T01:00:00Z' };
  expect(masteryFromAttempts([record], categories).authorization.stars).toBe(1);
  record.badges.defense = { achieved: true, at: '2026-10-12T02:00:00Z' };
  expect(masteryFromAttempts([record], categories).authorization.stars).toBe(2);
  record.badges.understanding = { achieved: true, at: '2026-10-12T03:00:00Z' };
  const mastery = masteryFromAttempts([record], categories).authorization;
  expect(mastery.stars).toBe(3);
  expect(mastery.evidence.map((item) => [item.stars, item.reason, item.attemptId, item.at])).toEqual([
    [1, '再現の達成印', '演習', '2026-10-12T03:00:00Z'],
    [2, '防御の達成印', '演習', '2026-10-12T03:00:00Z'],
    [3, '再現・防御・理解がそろった', '演習', '2026-10-12T03:00:00Z'],
  ]);
});

it('防御だけの記録は★2で、再現の根拠は残さず、時刻のない達成印は作成時刻に遡る', () => {
  const record = makeAttempt('防御のみ', { badges: { reproduction: { achieved: false }, defense: { achieved: true }, understanding: { achieved: false } } });
  const mastery = masteryFromAttempts([record], categories).authorization;
  expect(mastery.stars).toBe(2);
  expect(mastery.evidence.map((item) => item.stars)).toEqual([2]);
  expect(mastery.evidence[0]?.at).toBe(record.createdAt);
});

it('同じseedの繰り返しでは上がらず、別のseed・別の条件・別の課題で★4・★5になり上限で止まる', () => {
  const first = complete('最初');
  expect(masteryFromAttempts([first, complete('同じ')], categories).authorization.stars).toBe(3);
  const second = complete('別seed', 43, 'default', '2026-10-13T00:00:00Z');
  expect(masteryFromAttempts([first, second], categories).authorization.stars).toBe(4);
  const third = complete('別条件', 42, '別', '2026-10-14T00:00:00Z');
  const summary = masteryFromAttempts([first, second, third, complete('上限', 44, 'default', '2026-10-15T00:00:00Z')], categories);
  expect(summary.authorization.stars).toBe(5);
  expect(summary.authorization.evidence.map((item) => [item.stars, item.attemptId])).toEqual([[1, '最初'], [2, '最初'], [3, '最初'], [4, '別seed'], [5, '別条件']]);
  const other = { ...complete('別課題', 42), missionId: 'other' };
  expect(masteryFromAttempts([first, other], { ...categories, other: 'authorization' }).authorization.stars).toBe(4);
});

it('作成順に見るので入力の順序で根拠が変わらず、分類の分からない課題は数えない', () => {
  const late = complete('後', 43, 'default', '2026-10-13T00:00:00Z');
  const early = complete('先', 42, 'default', '2026-10-12T00:00:00Z');
  const evidence = masteryFromAttempts([late, early], categories).authorization.evidence.map((item) => item.attemptId);
  expect(evidence).toEqual(['先', '先', '先', '後']);
  expect(masteryFromAttempts([{ ...complete('不明'), missionId: 'unknown' }], categories).authorization.stars).toBe(0);
});

it('分類ごとに独立して数える', () => {
  const summary = masteryFromAttempts([complete('認可'), { ...makeAttempt('出力'), missionId: 'xss', badges: { reproduction: { achieved: true }, defense: { achieved: false }, understanding: { achieved: false } } }], categories);
  expect(summary.authorization.stars).toBe(3);
  expect(summary['output-encoding'].stars).toBe(1);
  expect(summary['data-access'].stars).toBe(0);
});
