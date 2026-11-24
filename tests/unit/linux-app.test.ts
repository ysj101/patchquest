// 教材アプリ「Linux 端末」（本物の Linux を WASM のエミュレータで動かす）が、擬似シェルと同じ共通テストを通すこと（spec A01）と、
// 本物の sudo・visudo での一連の操作、機械の状態の変化の検出を確かめる
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { linuxApp } from '../../apps/shell/linux';
import { sudoeditSave, visudoSave } from '../../apps/shell/scenario';
import type { AppRequest, FixtureData, ObservedEvent, PrepareOptions } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';
import { machineEvaluator } from '../support/engine-runtime';
import { readMachineAsset } from '../support/machine-assets';
import { OPERATORS, type Result } from '../support/shell-terminal';

/** 機械を起動し直すテストは時間がかかる */
const SLOW = 600_000;

const options = (seed: number, implementations: PrepareOptions['implementations'] = {}): PrepareOptions => ({
  attemptId: `linux-${seed}`,
  app: { id: 'linux', version: linuxApp.descriptor.version },
  fixture: { generator: 'linux.default', seed },
  implementations,
});

it('共通テストがすべて通る', { timeout: SLOW }, async () => {
  const evaluator = machineEvaluator();
  const report = await evaluator.runSuite(options(42), linuxApp.tests, [], 'linux-42', '');
  await evaluator.dispose();
  expect(report.outcomes.filter((outcome) => !outcome.passed)).toEqual([]);
  expect(report.outcomes).toHaveLength(linuxApp.tests.length);
});

it('配布物を一度読めなくても、次の準備では読み直して機械を起動できる', { timeout: SLOW }, async () => {
  let failures = 1;
  const engine = new AppEngine(async (name) => {
    if (name === 'linux.state.zst' && failures-- > 0) throw new Error('読めません');
    return readMachineAsset(name);
  });
  await expect(engine.prepare(options(7))).rejects.toThrow('読めません');
  await expect(engine.prepare(options(7))).resolves.toHaveProperty('refs');
  await engine.dispose();
});

describe('本物の Linux の端末', { timeout: SLOW }, () => {
  const engine = new AppEngine(readMachineAsset);
  let refs: FixtureData['refs'];

  async function send(actor: string, request: AppRequest): Promise<Result & { events: ObservedEvent[]; status: number }> {
    const { session } = await engine.invoke({ kind: 'session', actor });
    const { response, events } = await engine.invoke({ kind: 'request', session: session ?? null, request });
    if (!response) throw new Error('応答がない');
    return { ...(response.body as unknown as Result), events, status: response.status };
  }
  const sh = (actor: string, line: string, cwd?: string) => send(actor, { method: 'POST', path: '/sh', body: cwd === undefined ? { line } : { line, cwd } });

  beforeAll(async () => {
    ({ refs } = await engine.prepare(options(7)));
  }, SLOW);
  afterAll(() => engine.dispose());

  it('初期データの利用者・ホスト名・ファイルが、機械の中に実在する', async () => {
    const name = String(refs['accounts.operator.name']);
    expect(await sh('operator', 'whoami; hostname; pwd')).toMatchObject({ exit: 0, stdout: [name, refs['host.name'], refs['accounts.operator.home']].join('\n') });
    expect((await sh('operator', 'id -Gn')).stdout.split(' ').sort()).toEqual([name, 'operators'].sort());
    expect((await sh('operator', 'uname -s; ls -l /etc/sudoers.d/operators 2>&1')).stdout).toMatch(/^Linux\n/);
    expect((await sh('admin', `sudo stat -c '%a %U' ${OPERATORS} /etc/sudoers`)).stdout).toBe('440 root\n440 root');
  });

  it('help は、シェルの組み込みコマンドの一覧ではなく、この端末でよく使うコマンドを案内する', async () => {
    const { stdout, exit } = await sh('operator', 'help');
    expect(exit).toBe(0);
    for (const command of ['whoami', 'cat 名前', 'sudo -l', 'sudo visudo -f 名前']) expect(stdout).toContain(command);
    expect(stdout).not.toContain('Built-in commands');
  });

  it('パイプ・リダイレクト・移動など、本物のシェルの機能を使える', async () => {
    expect((await sh('operator', 'cat runbook.txt | grep -c sudo')).stdout).toBe('2');
    expect(await sh('operator', 'cd /etc && pwd')).toMatchObject({ stdout: '/etc', cwd: '/etc' });
    expect(await sh('operator', 'cd /nowhere')).toMatchObject({ exit: 2, cwd: refs['accounts.operator.home'] });
    expect(await sh('operator', 'pwd', '/nowhere')).toMatchObject({ exit: 1, changed: false });
    expect(await sh('operator', 'exit 7')).toMatchObject({ exit: 7 });
  });

  it('sudo の判断と root での実行は、機械の中の記録から観測イベントになる', async () => {
    const maintenance = String(refs['programs.maintenance.path']);
    const denied = await sh('operator', `sudo ${maintenance}`);
    expect(denied).toMatchObject({ exit: 1, changed: false });
    expect(denied.stderr).toContain(`is not allowed to execute '${maintenance}' as root`);
    expect(denied.events).toEqual([{ type: 'sudo.decision', data: { user: refs['accounts.operator.name'], command: maintenance, runAs: 'root', decision: 'deny', reason: 'command not allowed' } }]);

    const allowed = await sh('admin', `sudo ${maintenance}`);
    expect(allowed).toMatchObject({ exit: 0, stdout: '保守操作を実行しました（root の権限）', changed: false });
    expect(allowed.events.map((event) => event.type)).toEqual(['sudo.decision', 'shell.exec']);
    expect(allowed.events[1]?.data).toEqual({ program: maintenance, user: refs['accounts.admin.name'], runAs: 'root' });
    expect(allowed.events.map((event) => linuxApp.describeEvent?.(event)).join('\n')).toContain(maintenance);
  });

  it('visudo は編集画面へ中身を渡し、書き換えた行を本物の構文確認を通して保存する', async () => {
    const opened = await sh('admin', 'sudo visudo -f operators', '/etc/sudoers.d');
    expect(opened).toMatchObject({ exit: 0, changed: false, stderr: '', editor: { path: OPERATORS } });
    expect(opened.editor?.lines).toEqual((await sh('admin', `sudo cat ${OPERATORS}`)).stdout.split('\n'));

    const rejected = await send('admin', visudoSave(OPERATORS, [{ line: 2, text: 'これは設定ではない' }]));
    expect(rejected).toMatchObject({ exit: 1, changed: false, stdout: '' });
    expect(rejected.stderr).toContain('syntax error');
    expect(await send('admin', visudoSave(OPERATORS, [{ line: 9, text: '# x' }]))).toMatchObject({ exit: 2, changed: false, stderr: expect.stringContaining('行番号は 1〜2 で指定してください（指定：9）') as unknown });
    expect(await send('operator', visudoSave(OPERATORS, [{ line: 1, text: '# x' }]))).toMatchObject({ exit: 1, changed: false });
    expect(await send('admin', { method: 'POST', path: '/sh', body: { line: 'true', edits: [{ line: 1, text: '# x' }] } })).toMatchObject({ exit: 1, stderr: expect.stringContaining('エディタが開かれなかった') as unknown });

    const saved = await send('admin', visudoSave(OPERATORS, [{ line: 1, text: '# 点検済み' }]));
    expect(saved).toMatchObject({ exit: 0, changed: true });
    expect(saved.events.at(-1)).toEqual({ type: 'file.changed', data: { path: OPERATORS, user: refs['accounts.admin.name'] } });
    expect(saved.events.map((event) => linuxApp.describeEvent?.(event)).at(-1)).toBe(`ファイルの変更：${OPERATORS}・利用者 ${String(refs['accounts.admin.name'])}`);
    expect(await send('admin', visudoSave(OPERATORS, [{ line: 1, text: '# 点検済み' }]))).toMatchObject({ exit: 0, changed: false });
  });

  it('visudo の編集画面で行を消す・足す編集も、開いたときの行番号で当てはめ、本物の構文確認を通して保存する', async () => {
    const before = (await sh('admin', `sudo cat ${OPERATORS}`)).stdout.split('\n');
    const [first = '', second = ''] = before;
    expect(before).toHaveLength(2);

    const rejected = await send('admin', visudoSave(OPERATORS, [{ after: 2, text: 'これは設定ではない' }]));
    expect(rejected).toMatchObject({ exit: 1, changed: false });
    expect(rejected.stderr).toContain('syntax error');
    expect(await send('admin', visudoSave(OPERATORS, [{ after: 3, text: '# x' }]))).toMatchObject({ exit: 2, changed: false, stderr: expect.stringContaining('行番号は 1〜2 で指定してください（指定：3）') as unknown });

    const saved = await send('admin', visudoSave(OPERATORS, [{ line: 1, remove: true }, { after: 0, text: '# 先頭に足した' }, { after: 2, text: '# 末尾 A' }, { after: 2, text: '# 末尾\tB' }]));
    expect(saved).toMatchObject({ exit: 0, changed: true });
    expect((await sh('admin', `sudo cat ${OPERATORS}`)).stdout.split('\n')).toEqual(['# 先頭に足した', second, '# 末尾 A', '# 末尾\tB']);
    expect(first).not.toBe('');
    // 同じ編集をもう一度送ると、行番号は書き換わったあとのファイルに当てはまる（再生は、同じ初期状態から行う）
    expect(await send('admin', visudoSave(OPERATORS, [{ line: 1, text: '# 先頭に足した' }]))).toMatchObject({ exit: 0, changed: false });
  });

  it('sudoedit は編集画面へ中身を渡し、書き換えた行を root の権限で保存する（構文は確かめない）', async () => {
    const host = String(refs['host.name']);
    // 相対パスで開いても、編集するファイルの絶対パスが分かる
    const opened = await sh('admin', 'sudoedit hostname', '/etc');
    expect(opened).toMatchObject({ exit: 0, changed: false, stderr: '', editor: { path: '/etc/hostname', lines: [host] } });
    expect(await sh('operator', 'sudoedit /etc/hostname')).toMatchObject({ exit: 1, changed: false, stderr: expect.stringContaining('is not allowed to execute') as unknown });
    expect(await send('operator', sudoeditSave('/etc/hostname', [{ line: 1, text: 'x' }]))).toMatchObject({ exit: 1, changed: false, stderr: expect.stringContaining('エディタが開かれなかった') as unknown });
    expect(await send('admin', sudoeditSave('/etc/hostname', [{ line: 2, text: 'x' }]))).toMatchObject({ exit: 2, changed: false, stderr: expect.stringContaining('sudoedit: 行番号は 1〜1 で指定してください（指定：2）') as unknown });

    const saved = await send('admin', sudoeditSave('/etc/hostname', [{ line: 1, text: `${host} # 点検済み` }, { after: 1, text: '足した行' }]));
    expect(saved).toMatchObject({ exit: 0, changed: true, stderr: '' });
    expect(saved.events.at(-1)).toEqual({ type: 'file.changed', data: { path: '/etc/hostname', user: refs['accounts.admin.name'] } });
    expect((await sh('operator', 'cat /etc/hostname; stat -c "%a %U" /etc/hostname')).stdout).toBe(`${host} # 点検済み\n足した行\n644 root`);
    expect(await send('admin', sudoeditSave('/etc/hostname', [{ line: 2, text: '足した行' }]))).toMatchObject({ exit: 0, changed: false });
  });

  it('ファイルを変えたコマンドだけが、機械の状態を変えたことになる', async () => {
    expect(await sh('operator', 'echo memo > note.txt')).toMatchObject({ exit: 0, changed: true });
    expect(await sh('operator', 'cat note.txt; echo x > /tmp/scratch')).toMatchObject({ stdout: 'memo', changed: false });
    expect(await sh('operator', 'chmod 600 note.txt')).toMatchObject({ changed: true });
  });

  it('終わらないコマンドは止め、画面を持つエディタは入力を受け取れない', async () => {
    const stopped = await sh('operator', 'sleep 60');
    expect(stopped).toMatchObject({ exit: 124, stderr: expect.stringContaining('止めました') as unknown });
    // 画面を描く制御文字を出さずに、使えないことと代わりの方法を伝える
    expect(await sh('operator', 'vi note.txt')).toMatchObject({ exit: 1, stdout: '', stderr: expect.stringContaining('画面全体を使うプログラムは動きません') as unknown });
    expect(await sh('operator', 'whoami')).toMatchObject({ exit: 0 });
  });

  it('形の違う要求と長すぎる入力は、機械へ渡さずに断る', async () => {
    expect((await send('operator', { method: 'POST', path: '/sh', body: { line: 'pwd', cwd: 'relative' } })).status).toBe(400);
    expect((await send('operator', { method: 'PUT', path: '/sh' })).status).toBe(405);
    expect((await send('operator', { method: 'GET', path: '/other' })).status).toBe(404);
    expect((await send('anonymous', { method: 'GET', path: '/sh' })).status).toBe(401);
    expect(await sh('operator', `echo ${'x'.repeat(1100)}`)).toMatchObject({ exit: 2, stderr: 'sh: 入力が長すぎます（1024 文字まで）' });
  });

  it('端末を開くと、利用者・ホスト名と、機械の PATH にあるコマンド名（補完に使う）が分かる。観測イベントは残さない', async () => {
    const opened = await send('operator', { method: 'GET', path: '/sh' });
    expect(opened).toMatchObject({ user: refs['accounts.operator.name'], host: refs['host.name'], events: [] });
    const { commands } = opened as unknown as { commands: string[] };
    const maintenance = String(refs['programs.maintenance.path']).split('/').at(-1);
    expect(commands).toEqual(expect.arrayContaining(['cat', 'cd', 'grep', 'help', 'ls', 'sudo', 'visudo', 'whoami', maintenance]));
    expect(commands).toEqual([...new Set(commands)].sort());
  });

  it('補完のために、ディレクトリにある名前を機械に聞いて答える（ディレクトリは末尾に /）。ない場所・入れない場所は空で、観測イベントは残さない', async () => {
    const names = (actor: string, dir: string) => send(actor, { method: 'POST', path: '/sh/names', body: { dir } });
    const home = `/home/${String(refs['accounts.operator.name'])}`;
    expect(await names('operator', home)).toMatchObject({ names: expect.arrayContaining(['runbook.txt']) as unknown, events: [] });
    expect(((await names('operator', `${home}/../../etc/`)) as unknown as { names: string[] }).names).toEqual(expect.arrayContaining(['hostname', 'sudoers', 'sudoers.d/']));
    expect(await names('operator', '/etc/sudoers.d/')).toMatchObject({ names: ['operators'], events: [] });
    // 運用担当は /root に入れない
    expect(await names('operator', '/root/')).toMatchObject({ names: [] });
    expect(await names('operator', '/etc/none/')).toMatchObject({ names: [] });
    expect((await names('operator', 'etc')).status).toBe(400);
    expect((await names('anonymous', '/etc')).status).toBe(401);
    // 名前を聞いただけでは、機械の状態は変わらない
    expect(await sh('operator', 'true')).toMatchObject({ changed: false });
  });

  it('リセットすると、機械は初期状態へ戻る', async () => {
    await sh('operator', 'echo memo > kept.txt');
    await engine.reset();
    expect(await sh('operator', 'cat kept.txt')).toMatchObject({ exit: 1 });
  });
});
