// 実績の条件と解除日時、称号を保存された記録だけで確かめる。
import { expect, it } from 'vitest';
import { achievementsFromAttempts, titleFor } from '../../platform/progress/achievements';
import { makeAttempt } from '../support/attempt';

const options = { missionIds: ['課題A', '課題B'] };
const early = '2026-10-12T01:00:00Z';
const late = '2026-10-12T02:00:00Z';
const complete = () => makeAttempt('演習', {
  missionId: '課題A',
  firstPass: { at: late, verifications: 1, normalBroken: false, hintsUsed: false },
  badges: { reproduction: { achieved: true, at: early }, defense: { achieved: true, at: late }, understanding: { achieved: true, at: early } },
  history: [{ runId: '検証', at: late, defenseId: null, passed: true, undetermined: 0,
    groups: { attack: { passed: 1, total: 1 }, normal: { passed: 1, total: 1 }, regression: { passed: 1, total: 1 } } }],
});

it('記録なし・未達成では実績を解除せず、課題一覧が空でも全課題達成にしない', () => {
  expect(achievementsFromAttempts([], options)).toEqual({});
  expect(achievementsFromAttempts([makeAttempt('未達成')], { missionIds: [] })).toEqual({});
});

it('再現・防御と条件付き防御の解除時刻を達成印から導く', () => {
  expect(achievementsFromAttempts([complete()], options)).toEqual({
    'first-reproduction': early, 'first-defense': late, 'no-hint-defense': late, 'clean-repair': late, 'first-try': late,
  });
});

it.each([{ hintsOpened: [1] as [1] }, { solutionViewed: true }])('ヒントまたは解法の閲覧がある演習にはヒントなしの実績を付けない（%s）', (override) => {
  expect(achievementsFromAttempts([{ ...complete(), ...override, firstPass: { at: late, verifications: 1, normalBroken: false, hintsUsed: true } }], options)).not.toHaveProperty('no-hint-defense');
});

it('防御していない演習には条件付き防御を付けない', () => {
  const record = complete();
  record.badges.defense.achieved = false;
  expect(achievementsFromAttempts([record], options)).toEqual({ 'first-reproduction': early });
});

it('過去に正常系の失敗があれば正常利用の実績を付けず、初回失敗なら一度の検証も付けない', () => {
  const record = complete();
  const first = record.history[0];
  if (!first) throw new Error('検証履歴がありません');
  const failed = structuredClone(first);
  failed.passed = false;
  failed.groups.normal.passed = 0;
  record.history.unshift(failed);
  record.firstPass = { at: late, verifications: 2, normalBroken: true, hintsUsed: false };
  const unlocked = achievementsFromAttempts([record], options);
  expect(unlocked).not.toHaveProperty('clean-repair');
  expect(unlocked).not.toHaveProperty('first-try');
});

it('初回合格の事実がなければ条件付き防御は判定せず、判定不能は正常系の失敗に数えない', () => {
  expect(achievementsFromAttempts([{ ...complete(), history: [], firstPass: null }], options)).not.toHaveProperty('clean-repair');
  expect(achievementsFromAttempts([{ ...complete(), history: [], firstPass: null }], options)).not.toHaveProperty('first-try');
  const record = complete();
  const first = record.history[0];
  if (!first) throw new Error('検証履歴がありません');
  first.undetermined = 1;
  first.groups.normal = { passed: 0, total: 0 };
  expect(achievementsFromAttempts([record], options)).toHaveProperty('clean-repair', late);
});

it('全課題は指定IDごとの三印が必要で、最後に揃った時刻を使う', () => {
  const first = complete();
  const second = { ...complete(), missionId: '課題B' };
  second.badges.understanding.at = '2026-10-12T03:00:00Z';
  expect(achievementsFromAttempts([first], options)).not.toHaveProperty('all-missions');
  expect(achievementsFromAttempts([first, second], options)['all-missions']).toBe(second.badges.understanding.at);
  second.badges.understanding.achieved = false;
  expect(achievementsFromAttempts([first, second], options)).not.toHaveProperty('all-missions');
});

it('複数演習では最初の解除を選び、日時のない旧記録も同じ値に復元する', () => {
  const old = complete();
  delete old.badges.defense.at;
  expect(achievementsFromAttempts([old], options)['first-defense']).toBe(late);
  old.history = [];
  old.firstPass = null;
  expect(achievementsFromAttempts([old], options)['first-defense']).toBe(old.createdAt);
  expect(achievementsFromAttempts([complete(), old], options)['first-defense']).toBe(old.createdAt);
  expect(achievementsFromAttempts([old, complete()], options)['first-defense']).toBe(old.createdAt);
});

it.each([[0, '新人'], [1, '新人'], [2, '調査員'], [3, '調査員'], [4, '修理担当'], [5, '修理担当'], [6, '守り手']])('解除数%sの称号は%s', (count, title) => {
  expect(titleFor(count)).toBe(title);
});

it('再検証で防御の印が更新されても最初に合格した履歴の時刻を保つ', () => {
  const record = complete();
  record.badges.defense.at = '2026-10-13T00:00:00Z';
  const result = achievementsFromAttempts([record], options);
  expect(result['first-defense']).toBe(late);
  expect(result['first-try']).toBe(late);
});

it('全課題でも繰り返しの演習では最初に印が揃った記録を使う', () => {
  const first = complete();
  const later = { ...complete(), missionId: '課題B' };
  later.badges.understanding.at = '2026-10-13T00:00:00Z';
  const second = { ...complete(), missionId: '課題B' };
  expect(achievementsFromAttempts([later, second, first], options)['all-missions']).toBe(late);
});

it('ISO日時の表記やタイムゾーンが異なっても時間順に最初の解除を選ぶ', () => {
  const first = complete();
  first.badges.reproduction.at = '2026-10-12T09:00:00+09:00';
  const second = complete();
  second.badges.reproduction.at = '2026-10-12T00:00:01.000Z';
  expect(achievementsFromAttempts([second, first], options)['first-reproduction']).toBe(first.badges.reproduction.at);
});

it('初回合格後にヒントや解法を開き、正常系を壊しても解除済みの実績を保つ', () => {
  const record = complete();
  record.firstPass = { at: late, verifications: 1, normalBroken: false, hintsUsed: false };
  const before = achievementsFromAttempts([record], options);
  record.hintsOpened = [1];
  record.solutionViewed = true;
  const failed = record.history[0];
  if (!failed) throw new Error('検証履歴がありません');
  failed.passed = false;
  failed.groups.normal.passed = 0;
  record.badges.defense.at = '2026-10-13T00:00:00Z';
  expect(achievementsFromAttempts([record], options)).toEqual(before);
});

it('切り詰めた履歴がすべて成功でも初回合格までの失敗を忘れない', () => {
  const record = complete();
  record.firstPass = { at: late, verifications: 101, normalBroken: true, hintsUsed: true };
  const unlocked = achievementsFromAttempts([record], options);
  expect(unlocked).not.toHaveProperty('first-try');
  expect(unlocked).not.toHaveProperty('clean-repair');
  expect(unlocked).not.toHaveProperty('no-hint-defense');
});
