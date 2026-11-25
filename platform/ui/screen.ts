// 学習UIの画面と、その切り替えの遷移表。DOM に依存しない

/** list: 課題一覧 / records: 記録 / preflight: 開始前チェック / exercise: 演習画面 */
export type Screen = 'list' | 'records' | 'preflight' | 'exercise';

/**
 * 画面の遷移表（いまの画面 → 移れる画面）。演習画面には、開始前チェックからだけ入る（合格した演習だけを操作させる）。
 * 一覧・記録・開始前チェックへは、どの画面からでも移れる（同じ画面の描き直しを含む）。docs/formal/Navigation.tla が同じ表を検査する
 */
export const SCREEN_MACHINE: Readonly<Record<Screen, readonly Screen[]>> = {
  list: ['list', 'records', 'preflight'],
  records: ['list', 'records', 'preflight'],
  preflight: ['list', 'records', 'preflight', 'exercise'],
  exercise: ['list', 'records', 'preflight'],
};

/** 画面を移り、移った先を返す。遷移表にない移り方なら失敗する */
export function nextScreen(from: Screen, to: Screen): Screen {
  if (!SCREEN_MACHINE[from].includes(to)) throw new Error(`画面 ${from} から ${to} へは移れません`);
  return to;
}
