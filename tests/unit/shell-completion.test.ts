// 端末の入力欄での、コマンド名とファイル名の補完（Tab キー）を確かめる
import { describe, expect, it } from 'vitest';
import { complete, completeName, nameDir } from '../../apps/shell/completion';

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

describe('nameDir', () => {
  const dirAtEnd = (line: string) => nameDir(line, line.length, '/home/sato');

  it('引数の位置の語は、いまの場所か、語の / までの場所で名前を調べる', () => {
    expect(dirAtEnd('cat ru')).toBe('/home/sato');
    expect(dirAtEnd('cat ')).toBe('/home/sato');
    expect(dirAtEnd('cat /etc/sudoers.d/ope')).toBe('/etc/sudoers.d/');
    expect(dirAtEnd('cat /')).toBe('/');
    expect(dirAtEnd('ls notes/dr')).toBe('/home/sato/notes/');
    expect(dirAtEnd('cat ../ta')).toBe('/home/sato/../');
    expect(nameDir('cat ho', 6, '/')).toBe('/');
  });

  it('コマンドを書く位置でも、パス（/ を含む語）はファイル名として補う', () => {
    expect(dirAtEnd('/usr/local/bin/app')).toBe('/usr/local/bin/');
    expect(dirAtEnd('sudo ./ru')).toBe('/home/sato/./');
  });

  it('コマンド名として補う語・行の先頭の空の語・オプション・引用符や展開の記号を含む語は、対象にしない', () => {
    expect(dirAtEnd('vis')).toBeNull();
    expect(dirAtEnd('sudo vis')).toBeNull();
    expect(dirAtEnd('')).toBeNull();
    expect(dirAtEnd('ls | ')).toBeNull();
    expect(dirAtEnd('ls -l')).toBeNull();
    expect(dirAtEnd('cat "/etc/ho')).toBeNull();
    expect(dirAtEnd('cat ~/ru')).toBeNull();
    expect(dirAtEnd('cat $HOME/ru')).toBeNull();
    expect(dirAtEnd('echo x >/tmp/a')).toBeNull();
  });
});

describe('completeName', () => {
  const NAMES = ['.profile', 'notes/', 'notice.txt', 'runbook.txt', 'my file.txt'];
  const nameAtEnd = (line: string) => completeName(line, line.length, NAMES);

  it('候補が 1 つなら、ファイルは名前と空白 1 つ、ディレクトリは名前と / まで補う', () => {
    expect(nameAtEnd('cat ru')).toEqual({ line: 'cat runbook.txt ', cursor: 16, listed: [] });
    expect(nameAtEnd('ls note')).toEqual({ line: 'ls notes/', cursor: 9, listed: [] });
  });

  it('語のうち場所の部分は残し、名前の部分だけを補う', () => {
    expect(completeName('cat /etc/sudoers.d/ope', 22, ['README', 'operators'])).toEqual({ line: 'cat /etc/sudoers.d/operators ', cursor: 29, listed: [] });
    expect(completeName('cat /etc/ho | wc', 11, ['hostname', 'passwd'])).toEqual({ line: 'cat /etc/hostname | wc', cursor: 17, listed: [] });
  });

  it('候補が複数なら、共通する部分まで補い、それ以上補えないときは候補を名前順に並べて返す', () => {
    expect(nameAtEnd('cat n')).toEqual({ line: 'cat not', cursor: 7, listed: [] });
    expect(nameAtEnd('cat not')).toEqual({ line: 'cat not', cursor: 7, listed: ['notes/', 'notice.txt'] });
  });

  it('. で始まる名前は、. から打ったときだけ候補にする。空白を含む名前は候補にしない', () => {
    expect(nameAtEnd('cat ')).toEqual({ line: 'cat ', cursor: 4, listed: ['notes/', 'notice.txt', 'runbook.txt'] });
    expect(nameAtEnd('cat .')).toEqual({ line: 'cat .profile ', cursor: 13, listed: [] });
    expect(nameAtEnd('cat my')).toEqual({ line: 'cat my', cursor: 6, listed: [] });
  });
});
