// 擬似シェルのユニットテストで使う、端末のやり取りの部品。教材ロジックを直接動かし、コマンド行と visudo の保存を送る
import { expect } from 'vitest';
import { shellApp } from '../../apps/shell';
import { visudoSave } from '../../apps/shell/scenario';
import type { EditorFile, LineEdit } from '../../apps/shell/shell';
import type { AppRequest, AppResponse, ObservedEvent, PrepareOptions } from '../../platform/contract';
import type { AppEngine } from '../../runtimes/browser/engine';

/** 運用担当向けの sudo の設定ファイル */
export const OPERATORS = '/etc/sudoers.d/operators';

/** 擬似シェルを seed から用意するときの指定 */
export const shellOptions = (seed: number, implementations: Record<string, string> = {}): PrepareOptions => ({
  attemptId: `shell-${seed}`,
  app: { id: 'shell', version: shellApp.descriptor.version },
  fixture: { generator: 'shell.default', seed },
  implementations,
});

export interface Result {
  stdout: string;
  stderr: string;
  exit: number;
  cwd: string;
  changed: boolean;
  editor?: EditorFile;
}

/** 利用者としてやり取りを 1 回送る */
export function send(engine: AppEngine, actor: string, request: { method: AppRequest['method']; path: string; body?: unknown }): { response: AppResponse; events: ObservedEvent[] } {
  const session = engine.invoke({ kind: 'session', actor }).session ?? null;
  const { response, events } = engine.invoke({ kind: 'request', session, request: request as never });
  if (!response) throw new Error('応答がない');
  return { response, events };
}

/** コマンド行を 1 つ実行し、端末の出力を返す */
export function sh(engine: AppEngine, actor: string, line: string, cwd?: string): Result & { events: ObservedEvent[] } {
  const { response, events } = send(engine, actor, { method: 'POST', path: '/sh', body: cwd === undefined ? { line } : { line, cwd } });
  expect(response.status).toBe(200);
  return { ...(response.body as unknown as Result), events };
}

/** visudo の編集画面で行を書き換えて保存する（端末の画面が保存のときに送るものと同じ形） */
export function save(engine: AppEngine, actor: string, file: string, edits: LineEdit[]): Result & { events: ObservedEvent[] } {
  const { response, events } = send(engine, actor, visudoSave(file, edits));
  expect(response.status).toBe(200);
  return { ...(response.body as unknown as Result), events };
}
