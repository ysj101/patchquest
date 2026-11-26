// TLA+ のモデル（docs/formal）に書いた遷移表が、コードの遷移表と同じであることを確かめる。片方だけを書き換えたら、ここで分かる。
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { EXERCISE_MACHINE } from '../../platform/contract';
import { POPOVER_MACHINE } from '../../platform/ui/popover-model';
import { SCREEN_MACHINE } from '../../platform/ui/screen';

/** モデルの「名前 == { <<"a", "b">>, ... }」に並ぶ組を、書かれた順に取り出す */
function tuples(module: string, name: string): string[][] {
  const source = readFileSync(new URL(`../../docs/formal/${module}.tla`, import.meta.url), 'utf8');
  const body = new RegExp(`^${name} ==\\s*\\{([^}]*)\\}`, 'm').exec(source)?.[1];
  if (body === undefined) throw new Error(`${module}.tla に ${name} がありません`);
  // 組は << と >> の間、名前は " と " の間（" で区切ると、奇数番目が名前になる）
  return body.split('<<').slice(1).map((part) => (part.split('>>')[0] ?? '').split('"').filter((_, index) => index % 2 === 1));
}

/** コードの遷移表（状態 → 出来事 → 次の状態）を、モデルと同じ組の並びにする */
function rows(machine: Readonly<Record<string, Readonly<Partial<Record<string, string>>>>>): string[][] {
  return Object.entries(machine).flatMap(([from, events]) => Object.entries(events).map(([event, to]) => [from, event, to ?? '']));
}

it('演習の状態遷移表は、Exercise.tla の Transitions と同じ', () => {
  expect(tuples('Exercise', 'Transitions')).toEqual(rows(EXERCISE_MACHINE));
});

it('ポップオーバーの遷移表は、Popover.tla の Transitions と同じ', () => {
  expect(tuples('Popover', 'Transitions')).toEqual(rows(POPOVER_MACHINE));
});

it('画面の遷移表は、Navigation.tla の Moves と同じ', () => {
  expect(tuples('Navigation', 'Moves')).toEqual(Object.entries(SCREEN_MACHINE).flatMap(([from, targets]) => targets.map((to) => [from, to])));
});
