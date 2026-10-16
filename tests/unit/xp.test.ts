// 演習記録から報酬を再計算し、繰り返しで増え続けないことを確かめる。
import { expect, it } from 'vitest';
import { xpFromAttempts } from '../../platform/progress/xp';
import { makeAttempt } from '../support/attempt';

const complete = (id: string, seed = 42, variantId = 'default') => makeAttempt(id, {
  seed, variantId,
  milestones: { briefedAt: '時刻', firstRequestAt: '時刻', firstDefenseAt: '時刻' },
  badges: { reproduction: { achieved: true }, defense: { achieved: true }, understanding: { achieved: true } },
});

it('空の記録は0 XPでレベル1、次は100 XP', () => {
  expect(xpFromAttempts([])).toEqual({ total: 0, level: 1, nextLevelAt: 100, byMission: {}, review: 0 });
});

it('各ステージの到達に10・20・30・30・50 XPを与え、同じ記録の更新で二重に与えない', () => {
  const record = makeAttempt('演習');
  const steps = [
    () => { record.milestones.briefedAt = '時刻'; },
    () => { record.milestones.firstRequestAt = '時刻'; },
    () => { record.badges.reproduction.achieved = true; },
    () => { record.milestones.firstDefenseAt = '時刻'; },
    () => { record.badges.defense.achieved = true; record.badges.understanding.achieved = true; },
  ];
  for (const [index, step] of steps.entries()) {
    const before = xpFromAttempts([record]).total;
    step();
    expect(xpFromAttempts([record]).total - before).toBe([10, 20, 30, 30, 50][index]);
    expect(xpFromAttempts([record, record]).total).toBe(xpFromAttempts([record]).total);
  }
  expect(xpFromAttempts([record]).total).toBe(140);

});

it('同じ課題の複数演習を作成順に見て各ステージは一度だけ与え、別課題は独立する', () => {
  const first = makeAttempt('中断', { milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null } });
  expect(xpFromAttempts([complete('続き'), first]).byMission['test-pack']).toEqual({ stages: 140, retries: 0 });
  expect(xpFromAttempts([complete('一回目'), complete('繰り返し')]).total).toBe(140);
  expect(xpFromAttempts([complete('一回目'), { ...complete('別課題'), missionId: '別' }]).total).toBe(280);
});

it('全達成の再挑戦は別seedか別条件だけ20 XP、同条件の繰り返しは除き課題ごとに3回まで', () => {
  const records = [complete('最初'), complete('同じ'), complete('別seed', 43), complete('別条件', 42, '別'), complete('三回', 44), complete('上限', 45)];
  expect(xpFromAttempts(records.slice(0, 2)).total).toBe(140);
  expect(xpFromAttempts(records.slice(0, 3)).total).toBe(160);
  expect(xpFromAttempts(records.slice(0, 4)).total).toBe(180);
  expect(xpFromAttempts(records).byMission['test-pack']).toEqual({ stages: 140, retries: 60 });
  const incomplete = records.at(2);
  if (!incomplete) throw new Error('再挑戦の記録がありません');
  incomplete.badges.understanding.achieved = false;
  expect(xpFromAttempts(records.slice(0, 3)).total).toBe(140);
});

it.each([[0, 1, 100], [1, 2, 250], [2, 3, 450], [4, 4, 700], [5, 5, null]])('全達成の課題が%s個のときレベルと次の閾値を返す', (count, level, nextLevelAt) => {
  const records = Array.from({ length: count }, (_, index) => ({ ...complete(String(index)), missionId: String(index) }));
  expect(xpFromAttempts(records)).toMatchObject({ level, nextLevelAt });
});

it.each([
  [90, 1, 100], [100, 2, 250], [240, 2, 250], [250, 3, 450],
  [440, 3, 450], [450, 4, 700], [690, 4, 700], [700, 5, null],
] as const)('合計%s XPでレベル%sとなり、次の閾値は%s', (total, level, nextLevelAt) => {
  const attempts = Array.from({ length: total / 10 }, (_, index) => makeAttempt(String(index), {
    missionId: String(index), milestones: { briefedAt: '時刻', firstRequestAt: null, firstDefenseAt: null },
  }));
  expect(xpFromAttempts(attempts)).toMatchObject({ total, level, nextLevelAt });
});

it('対策を取り消した後も記録上の防御と理解で到達した報酬を保つ', () => {
  const record = complete('取り消し');
  record.appliedDefense = null;
  record.state = 'Repairing';
  expect(xpFromAttempts([record]).total).toBe(140);
});
