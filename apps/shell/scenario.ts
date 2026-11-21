// 擬似シェルのテスト・攻撃の成立条件・修正の記録を、手順のデータとして書くための部品。アプリ共通のテストと課題パックで使う
import type { AppRequest, EventExpectation, ExchangeMatcher, ResponseExpectation, Step } from '../../platform/contract';
import type { LineEdit } from './shell';

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

/**
 * visudo の編集画面で行を書き換えて保存する要求（端末の画面が保存のときに送るものと同じ形）。
 * cwd を付けると、その場所から見た相対パスで開いたことになる
 */
export const visudoSave = (file: string, edits: LineEdit[], cwd?: string): AppRequest => ({
  method: 'POST',
  path: '/sh',
  body: { line: `sudo visudo -f ${file}`, ...(cwd !== undefined && { cwd }), edits },
});

/** visudo で行を書き換えて保存する手順。file と書き換える内容の {{キー}} は fixture の値に置き換わる */
export const saveWithVisudo = (as: string, file: string, edits: LineEdit[], expect: ResponseExpectation, events?: EventExpectation[]): Step => ({
  kind: 'request',
  as,
  request: visudoSave(file, edits),
  expect,
  ...(events ? { events } : {}),
});

/** コマンドが成功し、機械の状態を変えた */
export const SAVED: ResponseExpectation = { status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'changed', is: { equals: true } }] };

/** プログラムが root の権限で実行された、という観測イベント。応答の文字列ではなく、実際の実行の記録で判定する */
export const ranAsRoot = (program: string, presence: 'present' | 'absent' = 'present'): EventExpectation => ({
  type: 'shell.exec',
  where: [{ path: 'program', is: { equals: program } }, { path: 'runAs', is: { equals: 'root' } }],
  presence,
});

/**
 * 機械の状態を変えたコマンド行のやり取り（visudo で書き換えて保存した）。操作で直す課題の repair.record に使う。
 * 調べるだけの操作や、断られた操作には合わない
 */
export const STATE_CHANGING_COMMAND: ExchangeMatcher = {
  kind: 'request',
  request: { method: 'POST', path: '/sh' },
  response: { status: 200, body: [{ path: 'changed', is: { equals: true } }] },
};
