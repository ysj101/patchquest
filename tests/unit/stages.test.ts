// ステージを操作記録と達成印だけから導けることを確かめる。
import { expect, it } from 'vitest';
import { progressOf, recordedSeals, sealStates, stageStates } from '../../platform/progress/stages';
import { makeAttempt } from '../support/attempt';

it('未到達の最初のステージを現在地にし、順不同の到達も保つ', () => {
  const attempt = makeAttempt('段階');
  expect(stageStates(attempt, true).map(({ state, current }) => [state, current])).toEqual([
    ['todo', true], ['todo', false], ['todo', false], ['todo', false], ['todo', false],
  ]);
  attempt.milestones = { briefedAt: '時刻', firstRequestAt: '時刻', firstDefenseAt: '時刻' };
  attempt.badges.defense.achieved = true;
  expect(stageStates(attempt, true).map(({ state, current }) => [state, current])).toEqual([
    ['done', false], ['done', false], ['todo', true], ['done', false], ['todo', false],
  ]);
  attempt.badges.reproduction.achieved = true;
  attempt.badges.understanding.achieved = true;
  expect(stageStates(attempt, true).every(({ state, current }) => state === 'done' && !current)).toBe(true);
});

it.each([[false, false], [true, false], [false, true], [true, true]])('最終テストは防御 %s と理解 %s の両方が達成されたときだけ済になる', (defense, understanding) => {
  const attempt = makeAttempt('最終確認');
  attempt.badges.defense.achieved = defense;
  attempt.badges.understanding.achieved = understanding;
  expect(stageStates(attempt, true).at(-1)?.state).toBe(defense && understanding ? 'done' : 'todo');
});

it('防御の記録があっても現在の構成で確認できていなければ最終テストは済にならない', () => {
  const attempt = makeAttempt('再検証待ち', {
    milestones: { briefedAt: '時刻', firstRequestAt: '時刻', firstDefenseAt: '時刻' },
    badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } },
  });
  expect(stageStates(attempt, false).at(-1)).toMatchObject({ state: 'todo', current: true });
  expect(stageStates(attempt, true).at(-1)).toMatchObject({ state: 'done', current: false });
});

it('記録どおりの達成印は、現在の構成で確認できていなくても、防御の記録があれば済にする', () => {
  const attempt = makeAttempt('一覧', { badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: false } } });
  expect(sealStates(attempt, false)).toEqual({ reproduction: 'done', defense: 'stale', understanding: 'todo' });
  expect(recordedSeals(attempt)).toEqual({ reproduction: 'done', defense: 'done', understanding: 'todo' });
  // 記録がない課題は、3 つとも未
  expect(recordedSeals(undefined)).toEqual({ reproduction: 'todo', defense: 'todo', understanding: 'todo' });
});

it.each([
  [0, 'todo'],
  [1, 'doing'],
  [2, 'doing'],
  [3, 'done'],
] as const)('達成印が %i 個の記録の進み具合は %s になる', (achieved, expected) => {
  const badges = { reproduction: { achieved: achieved >= 1 }, defense: { achieved: achieved >= 2 }, understanding: { achieved: achieved >= 3 } };
  expect(progressOf(makeAttempt('進み具合', { badges }))).toBe(expected);
});

it('記録がない課題と、ステージだけ進んで達成印のない記録は、どちらも未着手として扱う', () => {
  expect(progressOf(undefined)).toBe('todo');
  expect(progressOf(makeAttempt('調査だけ', { milestones: { briefedAt: '時刻', firstRequestAt: '時刻', firstDefenseAt: '時刻' } }))).toBe('todo');
});
