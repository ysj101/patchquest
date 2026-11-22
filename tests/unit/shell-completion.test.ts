// 端末の入力欄での、コマンド名の補完（Tab キー）を確かめる
import { describe, expect, it } from 'vitest';
import { complete } from '../../apps/shell/completion';

const COMMANDS = ['cat', 'cd', 'help', 'ls', 'sudo', 'visudo', 'whoami', 'who'];
/** 行の末尾にカーソルがあるときの補完 */
const atEnd = (line: string) => complete(line, line.length, COMMANDS);

describe('complete', () => {
  it('候補が 1 つなら、その名前と空白 1 つを補う', () => {
    expect(atEnd('vis')).toEqual({ line: 'visudo ', cursor: 7, listed: [] });
  });

  it('候補が複数なら、共通する部分まで補い、それ以上補えないときは候補を名前順に並べて返す', () => {
    expect(atEnd('w')).toEqual({ line: 'who', cursor: 3, listed: [] });
    expect(atEnd('who')).toEqual({ line: 'who', cursor: 3, listed: ['who', 'whoami'] });
    expect(atEnd('c')).toEqual({ line: 'c', cursor: 1, listed: ['cat', 'cd'] });
  });

  it('候補がなければ、行を変えず、並べる候補も返さない', () => {
    expect(atEnd('xyz')).toEqual({ line: 'xyz', cursor: 3, listed: [] });
  });

  it('sudo の直後と、パイプや ; の直後の語も、コマンド名として補う', () => {
    expect(atEnd('sudo vis')).toEqual({ line: 'sudo visudo ', cursor: 12, listed: [] });
    expect(atEnd('cat /etc/hosts | su')).toEqual({ line: 'cat /etc/hosts | sudo ', cursor: 22, listed: [] });
    expect(atEnd('ls;whoa')).toEqual({ line: 'ls;whoami ', cursor: 10, listed: [] });
    expect(atEnd('ls && he')).toEqual({ line: 'ls && help ', cursor: 11, listed: [] });
  });

  it('引数の位置の語・空の語・パスは、補完の対象にしない', () => {
    expect(atEnd('cat vis')).toBeNull();
    expect(atEnd('sudo -l vis')).toBeNull();
    expect(atEnd('')).toBeNull();
    expect(atEnd('ls ')).toBeNull();
    expect(atEnd('/usr/sbin/vis')).toBeNull();
    // sudo で終わる別の名前（visudo）の続きは、sudo の直後ではない
    expect(atEnd('visudo c')).toBeNull();
  });

  it('カーソルが行の途中にあるときは、カーソルの手前の語だけを補い、後ろは残す', () => {
    expect(complete('vis -f /etc/sudoers', 3, COMMANDS)).toEqual({ line: 'visudo -f /etc/sudoers', cursor: 6, listed: [] });
    expect(complete('whoxx', 3, COMMANDS)).toEqual({ line: 'whoxx', cursor: 3, listed: ['who', 'whoami'] });
  });

  it('同じ名前が重なっていても、候補は 1 つとして扱う', () => {
    expect(complete('l', 1, ['ls', 'ls'])).toEqual({ line: 'ls ', cursor: 3, listed: [] });
  });
});
