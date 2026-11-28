// git のリポジトリとデプロイ用の鍵を持つ機械（apps/shell/linux/repo.ts）。教材用の鍵・指紋・履歴の組み立てが食い違っていないことと、
// 本物の git が、同じ seed から同じ履歴（同じコミットの番号）を作ること、調べるだけの git のコマンドが機械の状態を変えないことを確かめる。
// 鍵の取り出しと作り直しの通しは、課題パックの出荷前検証（tests/unit/pack-verification.test.ts）が確かめる
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { linuxApp } from '../../apps/shell/linux';
import { LEAKED_FINGERPRINT, LEAKED_PRIVATE_KEY, LEAKED_PUBLIC_KEY, ROTATED_PUBLIC_KEY, fastImportStream, rotatedKeyOnly } from '../../apps/shell/linux/repo';
import type { FixtureData, PrepareOptions } from '../../platform/contract';
import { AppEngine } from '../../runtimes/browser/engine';
import { readMachineAsset } from '../support/machine-assets';
import { sh as run } from '../support/shell-terminal';

/** 公開鍵の行（種類 本体 コメント）の本体を、バイト列にする */
const blob = (publicKey: string): Buffer => Buffer.from(publicKey.split(' ')[1] ?? '', 'base64');

describe('教材用の鍵', () => {
  it('指紋は、公開鍵の本体の SHA-256（ssh-keygen -lf が出す形）と同じ', () => {
    expect(LEAKED_FINGERPRINT).toBe(`SHA256:${createHash('sha256').update(blob(LEAKED_PUBLIC_KEY)).digest('base64').replaceAll('=', '')}`);
  });

  it('秘密の鍵のファイルには、相方の公開鍵が入っている（作り直した鍵のものは入っていない）', () => {
    const body = Buffer.from(LEAKED_PRIVATE_KEY.split('\n').slice(1, -1).join(''), 'base64');
    expect(body.includes(blob(LEAKED_PUBLIC_KEY))).toBe(true);
    expect(body.includes(blob(ROTATED_PUBLIC_KEY))).toBe(false);
  });

  it('基準の実装は、作り直した鍵だけを登録する', () => {
    expect(rotatedKeyOnly({ leaked: LEAKED_PUBLIC_KEY, rotated: ROTATED_PUBLIC_KEY })).toEqual([ROTATED_PUBLIC_KEY]);
  });
});

describe('履歴を git fast-import が読む形にする', () => {
  it('作者と日時を固定し、中身はバイト数を先に書き、消すファイルは D で書く', () => {
    const stream = fastImportStream(
      [
        { at: '2026-10-02T17:40:00+09:00', message: '足す', files: { 'run.sh': 'echo あ', 'key': 'K' } },
        { at: '2026-10-05T09:05:00+09:00', message: '消す', files: { key: null } },
      ],
      'ito <ito@example.test>',
    );
    expect(stream).toBe(
      [
        'commit refs/heads/main',
        'author ito <ito@example.test> 1790930400 +0900',
        'committer ito <ito@example.test> 1790930400 +0900',
        'data 7',
        '足す',
        'M 100755 inline run.sh',
        // 「echo あ」と改行で 9 バイト（あ は 3 バイト）
        'data 9',
        'echo あ',
        'M 100644 inline key',
        'data 2',
        'K',
        '',
        'commit refs/heads/main',
        'author ito <ito@example.test> 1791158700 +0900',
        'committer ito <ito@example.test> 1791158700 +0900',
        'data 7',
        '消す',
        'D key',
        '',
      ].join('\n'),
    );
  });
});

describe('リポジトリを持つ機械', { timeout: 600_000 }, () => {
  const engine = new AppEngine(readMachineAsset);
  const options: PrepareOptions = { attemptId: 'linux-repo', app: { id: 'linux', version: linuxApp.descriptor.version }, fixture: { generator: 'linux.repo', seed: 7 }, implementations: {} };
  let refs: FixtureData['refs'];

  const sh = (actor: string, line: string) => run(engine, actor, line);

  beforeAll(async () => {
    ({ refs } = await engine.prepare(options));
  }, 600_000);
  afterAll(() => engine.dispose());

  it('同じ seed からは、同じ履歴（同じコミットの番号）になる', async () => {
    const head = await sh('operator', 'git -C app rev-parse HEAD');
    expect(head).toMatchObject({ exit: 0, stdout: '2785f61f3c07ef5d3a5c73c691993af2183a94e0' });
    // 用意し直しても変わらない
    await engine.prepare(options);
    expect((await sh('operator', 'git -C app rev-parse HEAD')).stdout).toBe(head.stdout);
    expect((await sh('operator', 'git -C app log --format=%s')).stdout.split('\n')).toEqual(['鍵をリポジトリから消す', 'デプロイの手順を足す', '最初のコミット']);
  });

  it('鍵は、いまのファイルにはなく、履歴からは取り出せる。取り出した鍵の指紋は、本物の ssh-keygen でも同じ値になる', async () => {
    expect((await sh('operator', 'ls -A app')).stdout.split('\n')).toEqual(['.git', '.gitignore', 'README.md', 'app.sh', 'deploy.sh']);
    expect((await sh('operator', 'git -C app log -p')).stdout).toContain(`-${String(refs['deploy.leaked.line'])}`);
    const taken = await sh('operator', 'git -C app show HEAD~1:deploy_key > /tmp/leaked_key && chmod 600 /tmp/leaked_key && ssh-keygen -lf /tmp/leaked_key');
    // /tmp に取り出すだけでは、機械の状態を変えたことにならない
    expect(taken).toMatchObject({ exit: 0, changed: false });
    expect(taken.stdout).toContain(LEAKED_FINGERPRINT);
    // 基準の状態では、履歴に残った鍵は登録されていない
    const registered = await sh('operator', `ssh-keygen -lf ${String(refs['deploy.keys.path'])}`);
    expect(registered.exit).toBe(0);
    expect(registered.stdout).not.toContain(LEAKED_FINGERPRINT);
  });

  it('調べるだけの git のコマンド（status・diff・log）は、機械の状態を変えない。コミットは変える', async () => {
    expect(await sh('operator', 'cd app && git status --short && git diff && git log --oneline > /dev/null')).toMatchObject({ exit: 0, stdout: '', changed: false });
    expect(await sh('operator', "cd app && echo 追記 >> README.md && git commit -q -a -m '追記'")).toMatchObject({ exit: 0, changed: true });
  });
});
