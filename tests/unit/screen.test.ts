// 学習UIの画面の遷移表を確かめる。
import { expect, it } from 'vitest';
import { SCREEN_MACHINE, nextScreen, type Screen } from '../../platform/ui/screen';

const SCREENS = Object.keys(SCREEN_MACHINE) as Screen[];
const canShow = (from: Screen, to: Screen) => SCREEN_MACHINE[from].includes(to);

it('演習画面には開始前チェックからだけ入り、ほかの画面へはどこからでも移れる', () => {
  expect(SCREENS.filter((from) => canShow(from, 'exercise'))).toEqual(['preflight']);
  for (const to of ['list', 'records', 'preflight'] as const) expect(SCREENS.filter((from) => canShow(from, to)), to).toEqual(SCREENS);
});

it('遷移表にある移り方では移った先を返し、ない移り方では失敗する', () => {
  expect(nextScreen('preflight', 'exercise')).toBe('exercise');
  expect(nextScreen('exercise', 'list')).toBe('list');
  expect(() => nextScreen('list', 'exercise')).toThrow('画面 list から exercise へは移れません');
});
