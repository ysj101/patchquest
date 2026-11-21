// 機械の中の記録（プログラムの実行・sudo の判断・変わったファイル）を観測イベントにし、その説明を返す。
// イベントの種類は擬似シェルと同じにして、同じテストと課題パックで判定できるようにする
import type { JsonValue, ObservedEvent } from '../../../platform/contract';
import { describeEvent as describeShellEvent, shown } from '../events';

type Emit = (type: string, data: Record<string, JsonValue>) => void;

const linesOf = (text: string): string[] => text.split('\n').filter((line) => line !== '');

/** sudo の記録の 1 行。例：「Oct 12 09:00:01 : sato : command not allowed ; PWD=/home/sato ; USER=root ; COMMAND=/usr/local/sbin/x」 */
const SUDO_LOG = /^\S+ +\d+ [\d:]+ : (?<user>\S+) : (?:(?<refusal>[^=;]+) ; )?(?:TTY=\S+ ; )?PWD=.*? ; USER=(?<runAs>\S+) ; COMMAND=(?<command>.*)$/;

/** プログラムが残した実行の記録（プログラム 利用者 実行した権限）を、実行のイベントにする */
export function emitExecutions(emit: Emit, log: string): void {
  for (const line of linesOf(log)) {
    const [program, user, runAs] = line.split(' ');
    if (program === undefined || user === undefined || runAs === undefined) throw new Error(`実行の記録を読めません：${line}`);
    emit('shell.exec', { program, user, runAs });
  }
}

/** sudo の記録を、判断のイベントにする。断った理由が書かれた行は拒否、書かれていない行は許可 */
export function emitSudoDecisions(emit: Emit, log: string): void {
  for (const line of linesOf(log)) {
    const fields = SUDO_LOG.exec(line)?.groups;
    if (!fields) throw new Error(`sudo の記録を読めません：${line}`);
    const { user = '', runAs = '', command = '', refusal } = fields;
    emit('sudo.decision', { user, command, runAs, decision: refusal === undefined ? 'allow' : 'deny', reason: refusal ?? '許可する設定がある' });
  }
}

/** 変わったファイルを、変更のイベントにする。変えたのがどの行かは機械からは分からないので、パスだけを記録する */
export function emitChanges(emit: Emit, paths: string[], user: string): void {
  for (const path of paths) emit('file.changed', { path, user });
}

export function describeEvent(event: ObservedEvent): string | null {
  if (event.type !== 'file.changed') return describeShellEvent(event);
  return `ファイルの変更：${shown(event.data.path)}・利用者 ${shown(event.data.user)}`;
}
