// 擬似シェルの基準実装（状態 S）が共通テストをすべて通すこと（spec A01）と、コマンドの解釈・sudo の判断を確かめる
import { beforeEach, describe, expect, it } from 'vitest';
import { shellApp } from '../../apps/shell';
import { tokenize } from '../../apps/shell/shell';
import { decide, parseSudoers } from '../../apps/shell/sudoers';
import type { FixtureData } from '../../platform/contract';
import { Evaluator } from '../../platform/evaluator/evaluator';
import { AppEngine } from '../../runtimes/browser/engine';
import { EngineRuntime } from '../support/engine-runtime';
import { OPERATORS, save, send, sh, shellOptions } from '../support/shell-terminal';

const SEEDS = [1, 42, 20261012];

describe.each(SEEDS)('擬似シェルの基準実装（seed %i）', (seed) => {
  it('共通テストがすべて通る', async () => {
    const evaluator = new Evaluator(() => new EngineRuntime());
    const report = await evaluator.runSuite(shellOptions(seed), shellApp.tests, [], `shell-${seed}`, '');
    await evaluator.dispose();
    expect(report.outcomes.filter((outcome) => !outcome.passed)).toEqual([]);
    expect(report.outcomes).toHaveLength(shellApp.tests.length);
  });
});

describe('初期データ', () => {
  it('同じ seed なら同じ機械になり、違う seed なら利用者名やプログラム名が変わる', async () => {
    const engine = new AppEngine();
    const first = await engine.prepare(shellOptions(1));
    expect(await engine.prepare(shellOptions(1))).toEqual(first);
    const others = await Promise.all([2, 3, 4, 5].map((seed) => new AppEngine().prepare(shellOptions(seed))));
    expect(others.every((other) => other.hash !== first.hash)).toBe(true);
    expect(new Set(others.map((other) => other.refs['accounts.operator.name'])).size).toBeGreaterThan(1);
  });

  it('どの seed でも機械を作れ、運用担当の 2 つの操作は重ならない', async () => {
    const engine = new AppEngine();
    for (let seed = 0; seed < 100; seed++) {
      const { refs } = await engine.prepare(shellOptions(seed));
      expect(refs['programs.operation.path']).not.toBe(refs['programs.operation2.path']);
    }
  });

  it('交換点が読めない設定を返したら、黙って続けずに初期データの生成を止める', async () => {
    await expect(new AppEngine().prepare(shellOptions(1, { 'shell.sudoers.provision': 'shell-test-pack/sudoers-unreadable' }))).rejects.toThrow('shell.sudoers.provision が返した設定を読めません（2 行目');
  });
});

describe('コマンドの解釈', () => {
  const engine = new AppEngine();
  let refs: FixtureData['refs'];
  let home: string;
  beforeEach(async () => {
    ({ refs } = await engine.prepare(shellOptions(7)));
    home = String(refs['accounts.operator.home']);
  });

  it('端末を開くと、利用者・ホスト名・ホームと、補完に使うコマンド名が分かる', async () => {
    const { response } = await send(engine, 'operator', { method: 'GET', path: '/sh' });
    const programs = ['maintenance', 'operation', 'public'].map((key) => String(refs[`programs.${key}.path`]).split('/').at(-1));
    const commands = ['cat', 'cd', 'help', 'id', 'ls', 'pwd', 'sudo', 'visudo', 'whoami', ...programs];
    expect(response).toMatchObject({ status: 200, body: { user: refs['accounts.operator.name'], host: refs['host.name'], cwd: home } });
    const listed = (response.body as { commands: string[] }).commands;
    expect(listed).toEqual(expect.arrayContaining(commands));
    // 名前だけでは実行できないもの（置き場所の名前や su）は入れない。名前順に並べる
    expect(listed).not.toContain('su');
    expect(listed).toEqual([...listed].sort());
  });

  it('whoami・id・pwd は、いまの利用者と場所を表示する', async () => {
    const name = String(refs['accounts.operator.name']);
    expect((await sh(engine, 'operator', 'whoami')).stdout).toBe(name);
    expect((await sh(engine, 'operator', 'id')).stdout).toMatch(new RegExp(`^uid=\\d+\\(${name}\\) groups=operators,${name}$`));
    expect(await sh(engine, 'operator', 'pwd')).toMatchObject({ stdout: home, cwd: home, exit: 0 });
    expect((await sh(engine, 'admin', 'sudo whoami')).stdout).toBe('root');
    expect((await sh(engine, 'admin', 'sudo id')).stdout).toBe('uid=0(root) groups=root');
  });

  it('cd は移動先を返し、相対パス・..・~ を解決する', async () => {
    expect((await sh(engine, 'operator', 'cd /etc')).cwd).toBe('/etc');
    expect((await sh(engine, 'operator', 'cd sudoers.d', '/etc')).cwd).toBe('/etc/sudoers.d');
    expect((await sh(engine, 'operator', 'cd ../..', '/etc/sudoers.d')).cwd).toBe('/');
    expect((await sh(engine, 'operator', 'cd', '/etc')).cwd).toBe(home);
    expect((await sh(engine, 'operator', 'cd ~/.', '/etc')).cwd).toBe(home);
    expect(await sh(engine, 'operator', 'cd /nowhere')).toMatchObject({ exit: 1, stderr: 'cd: /nowhere: No such file or directory', cwd: home });
    expect((await sh(engine, 'operator', 'cd /etc/hostname')).stderr).toBe('cd: /etc/hostname: Not a directory');
    expect((await sh(engine, 'operator', 'cd /root')).stderr).toBe('cd: /root: Permission denied');
    expect((await sh(engine, 'operator', 'cd /etc /var')).exit).toBe(2);
  });

  it('ls は中身を一覧し、ディレクトリと実行できるものに印を付ける', async () => {
    expect((await sh(engine, 'operator', 'ls /etc')).stdout).toBe('hostname\nsudoers\nsudoers.d/');
    expect((await sh(engine, 'operator', 'ls', '/usr/local/sbin')).stdout).toMatch(/^[a-z-]+\*$/);
    expect((await sh(engine, 'operator', 'ls /etc/hostname')).stdout).toBe('/etc/hostname');
    expect(await sh(engine, 'operator', 'ls -l')).toMatchObject({ exit: 2, stderr: 'ls: オプション -l には対応していません' });
    expect((await sh(engine, 'operator', 'ls /etc /var')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'ls /root')).stderr).toBe('ls: /root: Permission denied');
  });

  it('cat は読めるファイルだけを表示し、読めないものは理由を示す', async () => {
    expect((await sh(engine, 'operator', 'cat /etc/hostname')).stdout).toBe(refs['host.name']);
    expect(await sh(engine, 'operator', 'cat runbook.txt /etc/hostname /etc/none')).toMatchObject({ exit: 1, stderr: 'cat: /etc/none: No such file or directory' });
    expect((await sh(engine, 'operator', 'cat /etc')).stderr).toBe('cat: /etc: Is a directory');
    expect((await sh(engine, 'operator', 'cat /etc/sudoers')).stderr).toBe('cat: /etc/sudoers: Permission denied');
    expect((await sh(engine, 'operator', 'cat /usr/bin/cat')).stderr).toBe('cat: /usr/bin/cat: 実行ファイルの中身は表示できません');
    expect((await sh(engine, 'operator', 'cat')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'cat -n /etc/hostname')).exit).toBe(2);
    expect((await sh(engine, 'admin', 'sudo cat /etc/sudoers')).stdout).toContain('%admin ALL=(ALL) NOPASSWD: ALL');
  });

  it('登録したコマンドは絶対パスでも実行でき、プログラムは名前でも実行できる', async () => {
    expect((await sh(engine, 'operator', '/usr/bin/whoami')).stdout).toBe(refs['accounts.operator.name']);
    const { stdout, events } = await sh(engine, 'operator', 'sys-info');
    expect(stdout).toContain(String(refs['host.name']));
    expect(events).toEqual([{ type: 'shell.exec', data: { program: '/usr/local/bin/sys-info', user: refs['accounts.operator.name'], runAs: refs['accounts.operator.name'] } }]);
    expect(await sh(engine, 'operator', 'sys-info now')).toMatchObject({ exit: 2, stderr: 'sys-info: 引数は受け取りません' });
  });

  it('未実装のコマンドや対応していない書き方は、黙って無視せずに断る', async () => {
    expect(await sh(engine, 'operator', 'vi /etc/hosts')).toMatchObject({ exit: 127, stderr: 'sh: vi: command not found' });
    expect((await sh(engine, 'operator', '/usr/bin/vi')).exit).toBe(127);
    expect((await sh(engine, 'operator', 'cat /etc/hostname | wc')).stderr).toContain('「|」には対応していません');
    expect((await sh(engine, 'operator', 'echo "abc')).stderr).toBe('sh: 引用符が閉じていません');
    expect(await sh(engine, 'operator', `whoami ${'x'.repeat(1024)}`)).toMatchObject({ exit: 2, stderr: 'sh: 入力が長すぎます（1024 文字まで）' });
    expect((await sh(engine, 'operator', 'whoami now')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'id now')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'pwd now')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'help now')).exit).toBe(2);
    expect(await sh(engine, 'operator', '   ')).toMatchObject({ exit: 0, stdout: '', stderr: '' });
  });

  it('help は使えるコマンドを一覧する', async () => {
    const { stdout } = await sh(engine, 'operator', 'help');
    for (const usage of ['whoami', 'ls [パス]', 'visudo [-f ファイル]', 'sudo -l ／ sudo コマンド', 'help']) expect(stdout).toContain(usage);
  });

  it('形の違う要求は、理由を示して受け付けない', async () => {
    const post = async (body: unknown) => (await send(engine, 'operator', { method: 'POST', path: '/sh', body })).response;
    expect(await post('whoami')).toMatchObject({ status: 400 });
    expect(await post({ line: 1 })).toMatchObject({ status: 400 });
    expect(await post({ line: 'whoami\nid' })).toMatchObject({ status: 400 });
    expect(await post({ line: 'pwd', cwd: '/nowhere' })).toMatchObject({ status: 400, body: { error: 'cwd には、実在するディレクトリの絶対パスを入れてください' } });
    expect(await post({ line: 'pwd', cwd: 7 })).toMatchObject({ status: 400 });
    expect((await send(engine, 'operator', { method: 'PUT', path: '/sh' })).response.status).toBe(405);
    expect((await send(engine, 'operator', { method: 'GET', path: '/other' })).response.status).toBe(404);
    expect((await send(engine, 'anonymous', { method: 'GET', path: '/sh' })).response.status).toBe(401);
  });
});

describe('sudo の判断', () => {
  const engine = new AppEngine();
  let refs: FixtureData['refs'];
  beforeEach(async () => ({ refs } = await engine.prepare(shellOptions(11))));

  it('sudo -l は、自分が実行できるコマンドだけを一覧する', async () => {
    const operator = (await sh(engine, 'operator', 'sudo -l')).stdout;
    expect(operator).toContain(`User ${refs['accounts.operator.name']} may run the following commands on ${refs['host.name']}:`);
    expect(operator).toContain(`(root) NOPASSWD: ${refs['programs.operation.path']}, ${refs['programs.operation2.path']}`);
    expect(operator).not.toContain(String(refs['programs.maintenance.path']));
    expect((await sh(engine, 'admin', 'sudo -l')).stdout).toContain('(ALL) NOPASSWD: ALL');
  });

  it('許可・拒否の判断と、その根拠の設定の場所を観測イベントに記録する', async () => {
    const user = refs['accounts.operator.name'];
    const operation = refs['programs.operation.path'];
    const maintenance = refs['programs.maintenance.path'];
    expect((await sh(engine, 'operator', `sudo ${operation}`)).events).toEqual([
      { type: 'sudo.decision', data: { user, command: operation, runAs: 'root', decision: 'allow', reason: `${OPERATORS} の 2 行目で許可されている` } },
      { type: 'shell.exec', data: { program: operation, user, runAs: 'root' } },
    ]);
    const denied = await sh(engine, 'operator', `sudo ${maintenance}`);
    expect(denied).toMatchObject({ exit: 1, stderr: `Sorry, user ${user} is not allowed to execute '${maintenance}' as root on ${refs['host.name']}.` });
    expect(denied.events).toEqual([{ type: 'sudo.decision', data: { user, command: maintenance, runAs: 'root', decision: 'deny', reason: '許可する設定がない' } }]);
  });

  it('使い方の誤りと、sudo では実行できないものを断る', async () => {
    expect((await sh(engine, 'operator', 'sudo')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'sudo -l now')).exit).toBe(2);
    expect((await sh(engine, 'operator', 'sudo -u root whoami')).stderr).toContain('オプション -u には対応していません');
    expect((await sh(engine, 'admin', 'sudo cd /root')).stderr).toBe('sudo: cd: command not found');
    expect((await sh(engine, 'admin', 'sudo sudo whoami')).stderr).toBe('sudo: sudo: command not found');
  });

  it('パスワードを求める設定は、この端末では入力できないので実行しない', async () => {
    const operation = String(refs['programs.operation.path']);
    expect((await save(engine, 'admin', OPERATORS, [{ line: 2, text: `${refs['accounts.operator.name']} ALL=(root) ${operation}` }])).changed).toBe(true);
    const result = await sh(engine, 'operator', `sudo ${operation}`);
    expect(result).toMatchObject({ exit: 1, stderr: 'sudo: a password is required' });
    expect(result.events).toEqual([expect.objectContaining({ type: 'sudo.decision', data: expect.objectContaining({ decision: 'deny' }) as unknown })]);
  });

  it('許可をすべて外すと、sudo を使えない利用者になる', async () => {
    await save(engine, 'admin', OPERATORS, [{ line: 2, text: '# 外した' }]);
    expect(await sh(engine, 'operator', 'sudo -l')).toMatchObject({ exit: 1, stderr: `Sorry, user ${refs['accounts.operator.name']} may not run sudo on ${refs['host.name']}.` });
  });
});

describe('コマンド行の分解', () => {
  it('空白で区切り、引用符の中は 1 語にまとめる', () => {
    expect(tokenize('  cat  a.txt "x  y" \'# z\'  ')).toEqual({ words: ['cat', 'a.txt', 'x  y', '# z'] });
    expect(tokenize('a"b c"d \'\'')).toEqual({ words: ['ab cd', ''] });
    expect(tokenize('a#b')).toEqual({ words: ['a#b'] });
  });

  it.each(['a | b', 'a > b', 'a; b', 'a && b', 'echo $HOME', 'ls *', 'a `b`', 'a \\ b', 'ls ?'])('%s は対応していない記号として断る', (line) => {
    expect(tokenize(line)).toEqual({ error: expect.stringContaining('には対応していません') as unknown });
  });

  it('# で始まる語は、引用符で囲むよう求める', () => {
    expect(tokenize('cat a.txt # メモ')).toEqual({ error: expect.stringContaining('引用符で囲んでください') as unknown });
  });
});

describe('sudo の設定の読み取り', () => {
  it('利用者・グループ・実行する利用者・NOPASSWD・コマンドを読む', () => {
    const { entries, errors } = parseSudoers('# 見出し\n\nsato ALL=(root) NOPASSWD: /usr/bin/a, /usr/bin/b\n%admin  ALL = ( ALL ) ALL\ntanaka ALL=/usr/bin/c');
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { who: 'sato', runAs: 'root', nopasswd: true, commands: ['/usr/bin/a', '/usr/bin/b'], line: 3 },
      { who: '%admin', runAs: 'ALL', nopasswd: false, commands: ['ALL'], line: 4 },
      { who: 'tanaka', runAs: 'root', nopasswd: false, commands: ['/usr/bin/c'], line: 5 },
    ]);
  });

  it.each([
    ['Defaults env_reset', '「利用者 ALL=(実行する利用者) コマンド」の形ではありません'],
    ['sato web ALL=(root) /usr/bin/a', '利用者（または %グループ）を読めません'],
    ['SATO ALL=(root) /usr/bin/a', '利用者（または %グループ）を読めません'],
    ['sato web-01=(root) /usr/bin/a', 'ホストは ALL だけに対応しています'],
    ['sato ALL=(root /usr/bin/a', '( が閉じていません'],
    ['sato ALL=(a b) /usr/bin/a', '実行する利用者「a b」を読めません'],
    ['sato ALL=(root) NOPASSWD:', 'コマンドがありません'],
    ['sato ALL=(root) /usr/bin/a, !/usr/bin/b', 'コマンド「!/usr/bin/b」は絶対パスか ALL で書いてください'],
  ])('%s は構文エラーにする', (text, message) => {
    expect(parseSudoers(text)).toEqual({ entries: [], errors: [{ line: 1, message }] });
  });

  it('当てはまる設定のうち最後のものが効き、root 以外として実行する設定は root への許可にならない', () => {
    const { entries } = parseSudoers('sato ALL=(root) NOPASSWD: /usr/bin/a\n%ops ALL=(root) /usr/bin/a\nsato ALL=(backup) NOPASSWD: /usr/bin/b');
    expect(decide(entries, { name: 'sato', groups: ['sato'] }, '/usr/bin/a')).toMatchObject({ line: 1, nopasswd: true });
    expect(decide(entries, { name: 'sato', groups: ['sato', 'ops'] }, '/usr/bin/a')).toMatchObject({ line: 2, nopasswd: false });
    expect(decide(entries, { name: 'sato', groups: ['sato'] }, '/usr/bin/b')).toBeUndefined();
    expect(decide(entries, { name: 'suzuki', groups: ['suzuki'] }, '/usr/bin/a')).toBeUndefined();
  });
});
