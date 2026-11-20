// 擬似シェルのテスト・攻撃の成立条件・修正の記録を、手順のデータとして書くための部品。アプリ共通のテストと課題パックで使う
import type { EventExpectation, ExchangeMatcher, ResponseExpectation, Step } from '../../platform/contract';

/** コマンドが成功した（終了コード 0） */
export const SUCCEEDED: ResponseExpectation = { status: 200, body: [{ path: 'exit', is: { equals: 0 } }] };
/** コマンドが失敗し、機械の状態も変えなかった */
export const FAILED: ResponseExpectation = { status: 200, body: [{ path: 'exit', is: { notEquals: 0 } }, { path: 'changed', is: { equals: false } }] };

/** コマンド行を 1 つ送る手順。line の {{キー}} は fixture の値に置き換わる */
export const sh = (as: string, line: string, expect: ResponseExpectation, events?: EventExpectation[]): Step => ({
  kind: 'request',
  as,
  request: { method: 'POST', path: '/sh', body: { line } },
  expect,
  ...(events ? { events } : {}),
});

/** プログラムが root の権限で実行された、という観測イベント。応答の文字列ではなく、実際の実行の記録で判定する */
export const ranAsRoot = (program: string, presence: 'present' | 'absent' = 'present'): EventExpectation => ({
  type: 'shell.exec',
  where: [{ path: 'program', is: { equals: program } }, { path: 'runAs', is: { equals: 'root' } }],
  presence,
});

/**
 * 機械の状態を変えたコマンド行のやり取り（ファイルを書き換えた edit）。操作で直す課題の repair.record に使う。
 * 調べるだけの操作や、断られた操作には合わない
 */
export const STATE_CHANGING_COMMAND: ExchangeMatcher = {
  kind: 'request',
  request: { method: 'POST', path: '/sh' },
  response: { status: 200, body: [{ path: 'changed', is: { equals: true } }] },
};
