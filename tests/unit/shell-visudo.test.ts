// 擬似シェルの visudo（sudo の設定を開いて書き換え、構文を確かめて保存する）と、観測ログでのやり取りの表示を確かめる
import { beforeEach, describe, expect, it } from 'vitest';
import { describeEvent, describeExchange, describeRequest } from '../../apps/shell/events';
import { visudoSave } from '../../apps/shell/scenario';
import type { FixtureData } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';
import { OPERATORS, save, send, sh, shellOptions } from '../support/shell-terminal';

describe('sudo の設定の編集（visudo）', () => {
  const engine = new AppEngine();
  let refs: FixtureData['refs'];
  beforeEach(async () => ({ refs } = await engine.prepare(shellOptions(13))));

  it('保存する内容を付けずに実行すると、ファイルを開くだけで状態は変えない', async () => {
    const opened = await sh(engine, 'admin', `sudo visudo -f ${OPERATORS}`);
    expect(opened).toMatchObject({ exit: 0, changed: false, stdout: '' });
    expect(opened.editor?.path).toBe(OPERATORS);
    expect(opened.editor?.lines).toEqual((await sh(engine, 'admin', `sudo cat ${OPERATORS}`)).stdout.split('\n'));
    expect((await sh(engine, 'admin', 'sudo visudo')).editor?.path).toBe('/etc/sudoers');
    expect((await sh(engine, 'admin', 'sudo visudo -f operators', '/etc/sudoers.d')).editor?.path).toBe(OPERATORS);
  });

  it('書き換えた行だけを保存し、変えた行を観測イベントに記録する', async () => {
    const saved = await save(engine, 'admin', OPERATORS, [{ line: 1, text: '# 点検済み' }, { line: 2, text: '' }]);
    expect(saved).toMatchObject({ exit: 0, changed: true, stdout: `visudo: ${OPERATORS} の 1・2 行目を保存しました` });
    expect(saved.editor).toBeUndefined();
    expect(saved.events.at(-1)).toEqual({ type: 'file.changed', data: { path: OPERATORS, lines: [1, 2], user: refs['accounts.admin.name'], runAs: 'root' } });
    expect((await sh(engine, 'admin', `sudo cat ${OPERATORS}`)).stdout.split('\n')).toEqual(['# 点検済み', '']);
  });

  it('同じ内容での保存は、状態を変えたことにしない', async () => {
    await save(engine, 'admin', OPERATORS, [{ line: 1, text: '# 同じ' }]);
    const again = await save(engine, 'admin', OPERATORS, [{ line: 1, text: '# 同じ' }]);
    expect(again).toMatchObject({ exit: 0, changed: false, stdout: `visudo: ${OPERATORS} unchanged` });
    expect(again.events.filter((event) => event.type === 'file.changed')).toEqual([]);
  });

  it('root 以外・使い方の誤り・存在しないファイル・範囲外の行を断る', async () => {
    expect(await sh(engine, 'admin', `visudo -f ${OPERATORS}`)).toMatchObject({ exit: 1, stderr: `visudo: ${OPERATORS}: Permission denied` });
    expect((await sh(engine, 'operator', 'sudo visudo')).stderr).toContain("is not allowed to execute '/usr/sbin/visudo' as root");
    expect(await sh(engine, 'admin', 'sudo visudo -f')).toMatchObject({ exit: 2, stderr: 'usage: visudo [-f ファイル]' });
    expect((await sh(engine, 'admin', `sudo visudo ${OPERATORS}`)).exit).toBe(2);
    expect((await sh(engine, 'admin', 'sudo visudo -f /etc/none')).stderr).toBe('visudo: /etc/none: No such file or directory');
    expect((await sh(engine, 'admin', 'sudo visudo -f /etc')).stderr).toContain('編集できるのは通常のファイルだけです');
    expect(await save(engine, 'admin', OPERATORS, [{ line: 9, text: 'x' }])).toMatchObject({ exit: 2, changed: false, stderr: 'visudo: 行番号は 1〜2 で指定してください（指定：9）' });
  });

  it('構文を確かめてから保存し、読めない内容では保存しない', async () => {
    const rejected = await save(engine, 'admin', OPERATORS, [{ line: 2, text: `${refs['accounts.operator.name']} ALL=(root) NOPASSWD: backup` }]);
    expect(rejected).toMatchObject({ exit: 1, changed: false });
    expect(rejected.stderr).toBe(`visudo: ${OPERATORS}:2: 構文エラー：コマンド「backup」は絶対パスか ALL で書いてください\nvisudo: 変更は保存していません`);
    expect((await sh(engine, 'admin', `sudo cat ${OPERATORS}`)).stdout).toContain(String(refs['programs.operation.path']));
  });

  it.each([
    ['visudo 以外のコマンド行', { line: 'sudo -l', edits: [{ line: 1, text: 'x' }] }, 'visudo のコマンド行にだけ付けられます'],
    ['空の並び', { line: 'sudo visudo', edits: [] }, '1 件以上入れてください'],
    ['行番号が 0', { line: 'sudo visudo', edits: [{ line: 0, text: 'x' }] }, '1 件以上入れてください'],
    ['改行を含む内容', { line: 'sudo visudo', edits: [{ line: 1, text: 'a\nb' }] }, '1 件以上入れてください'],
    ['オブジェクトでない要素', { line: 'sudo visudo', edits: ['x'] }, '1 件以上入れてください'],
    ['同じ行番号が 2 回', { line: 'sudo visudo', edits: [{ line: 1, text: 'a' }, { line: 1, text: 'b' }] }, '同じ行番号を 2 回入れることはできません'],
  ])('書き換えた行の形が違う要求（%s）は、実行せずに断る', async (_name, body, message) => {
    const { response } = await send(engine, 'admin', { method: 'POST', path: '/sh', body });
    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toContain(message);
  });

  it('利用者の切り替えは端末ではできないので、切り替える場所を案内する', async () => {
    expect(await sh(engine, 'operator', 'su admin')).toMatchObject({ exit: 1, stderr: expect.stringContaining('「表示する利用者」で切り替えてください') as unknown });
  });
});
describe('観測イベントとやり取りの説明', () => {
  it('計測した値のまま説明し、知らない種類は説明しない', () => {
    expect(describeEvent({ type: 'sudo.decision', data: { user: 'sato', command: '/usr/bin/a', runAs: 'root', decision: 'deny', reason: '許可する設定がない' } })).toBe(
      'sudo の判断：拒否（許可する設定がない）・利用者 sato・コマンド /usr/bin/a・実行する利用者 root',
    );
    expect(describeEvent({ type: 'sudo.decision', data: { decision: 'allow' } })).toContain('sudo の判断：許可（null）');
    expect(describeEvent({ type: 'shell.exec', data: { program: '/usr/bin/a', user: 'sato', runAs: 'root' } })).toBe('プログラムの実行：/usr/bin/a・利用者 sato・実行した権限 root');
    expect(describeEvent({ type: 'file.changed', data: { path: '/etc/a', lines: [2, 3], user: 'ito', runAs: 'root' } })).toBe('ファイルの変更：/etc/a の 2・3 行目・利用者 ito・実行した権限 root');
    expect(describeEvent({ type: 'unknown', data: {} })).toBeNull();
  });

  it('コマンド行のやり取りは、端末に打った形で示す', () => {
    expect(describeRequest({ method: 'POST', path: '/sh', body: { line: 'sudo -l', cwd: '/home/sato' } })).toBe('$ sudo -l');
    expect(describeRequest(visudoSave('/etc/a', [{ line: 2, text: '# 外した' }, { line: 3, text: '' }]))).toBe('$ sudo visudo -f /etc/a（2 行目を「# 外した」に、3 行目を「」に書き換えて保存）');
    expect(describeRequest({ method: 'GET', path: '/sh' })).toBe('端末を開く');
    expect(describeRequest({ method: 'GET', path: '/other' })).toBeNull();
    expect(describeRequest({ method: 'PUT', path: '/sh', body: { line: 'sudo -l' } })).toBeNull();
    expect(describeRequest({ method: 'POST', path: '/sh', body: { line: 1 } })).toBeNull();
    expect(describeRequest({ method: 'POST', path: '/sh', body: ['sudo -l'] })).toBeNull();
  });

  it('観測ログでは、状態コードではなく終了コードと端末の出力で示す', () => {
    const request = { method: 'POST' as const, path: '/sh', body: { line: 'sudo /usr/bin/a' } };
    expect(describeExchange(request, { status: 200, body: { stdout: '', stderr: 'Sorry', exit: 1, cwd: '/home/sato', changed: false } })).toEqual({
      mark: { ok: false, text: '終了コード 1' },
      blocks: [
        { title: 'コマンド', text: '$ sudo /usr/bin/a\n（実行した場所：/home/sato）' },
        { title: '端末の出力', text: 'Sorry' },
      ],
    });
    expect(describeExchange(request, { status: 200, body: { stdout: '', stderr: '', exit: 0, cwd: '/', changed: false } })?.blocks.at(-1)).toEqual({ title: '端末の出力', text: '（出力なし）' });
  });

  it('エディタを開いたやり取りと保存したやり取りは、開いたファイルと書き換えた行で示す', () => {
    const opened = describeExchange({ method: 'POST', path: '/sh', body: { line: 'sudo visudo' } }, { status: 200, body: { stdout: '', stderr: '', exit: 0, cwd: '/', changed: false, editor: { path: '/etc/sudoers', lines: ['a'] } } });
    expect(opened?.blocks.at(-1)).toEqual({ title: '端末の出力', text: '（/etc/sudoers を編集画面で開きました）' });
    const saved = describeExchange(visudoSave('/etc/a', [{ line: 2, text: '# 外した' }]), { status: 200, body: { stdout: '保存', stderr: '', exit: 0, cwd: '/', changed: true } });
    expect(saved?.mark).toEqual({ ok: true, text: '終了コード 0' });
    expect(saved?.blocks[1]).toEqual({ title: 'エディタで書き換えた行', text: '2 行目：# 外した' });
  });

  it('端末を開いたやり取りはプロンプトで示し、コマンドを解釈できなかったやり取りは説明しない', () => {
    expect(describeExchange({ method: 'GET', path: '/sh' }, { status: 200, body: { user: 'sato', host: 'web-01', cwd: '/home/sato' } })).toEqual({
      mark: { ok: true, text: '端末' },
      blocks: [{ title: 'プロンプト', text: 'sato@web-01:/home/sato$' }],
    });
    expect(describeExchange({ method: 'POST', path: '/sh', body: { line: 'whoami' } }, { status: 401, body: { error: 'ログインが必要です' } })).toBeNull();
    expect(describeExchange({ method: 'POST', path: '/sh', body: { line: 1 } }, { status: 200, body: { exit: 0 } })).toBeNull();
    expect(describeExchange({ method: 'POST', path: '/sh', body: 'x' }, { status: 200, body: { exit: 0 } })).toBeNull();
    expect(describeExchange({ method: 'POST', path: '/sh', body: { line: 'x' } }, { status: 200, body: 'x' })).toBeNull();
    expect(describeExchange({ method: 'GET', path: '/other' }, { status: 200, body: {} })).toBeNull();
  });
});
