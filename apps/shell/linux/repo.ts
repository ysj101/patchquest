// git のリポジトリと、デプロイ用の鍵（SSH）を持つ機械の初期データ。共通の機械に、デプロイ用の利用者（deploy）と、ログインを許す鍵の一覧
// （~/.ssh/authorized_keys）、運用担当の手元のリポジトリを足す。リポジトリの履歴には、まちがってコミットした秘密の鍵と、それを消したコミットが残っている。
// 履歴は本物の git が作り（git fast-import）、鍵は本物の ssh-keygen で作った教材用のもの。どの鍵でのログインを許すかは、交換点が決める
import type { Database } from '../../../runtimes/browser/sqlite';
import { addAccount, put, type MachineAddition } from '../fixtures';
import { heredoc, quote } from './script';

/**
 * 配備時に、デプロイ用の利用者へのログインを許す公開鍵を決める処理。返した行が、authorized_keys の中身になる。契約 1。
 * leaked は履歴に残っている鍵の公開鍵、rotated はそのあとに作り直した鍵の公開鍵
 */
export const DEPLOY_KEYS_HOOK = 'linux.deploy.authorize';
export type AuthorizeDeployKeys = (keys: { leaked: string; rotated: string }) => string[];

/** デプロイ用の利用者。seed によらず同じ名前にする（修正の記録を再生するとき、同じパスを指すように） */
const DEPLOY = { name: 'deploy', actor: null, uid: 2000, home: '/home/deploy', groups: ['deploy'] };
const SSH_DIR = `${DEPLOY.home}/.ssh`;
/** ログインを許す公開鍵の一覧。場所と書式は、本物の sshd が読むものと同じ */
const AUTHORIZED_KEYS = `${SSH_DIR}/authorized_keys`;
/** リポジトリの中での、秘密の鍵のファイル名 */
const KEY_FILE = 'deploy_key';

/**
 * 履歴に残っている秘密の鍵。この教材のためだけに ssh-keygen で作ったもので、どこの機械にも登録していない。
 * 機械に置くと、末尾に改行が 1 つ付く
 */
export const LEAKED_PRIVATE_KEY = [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
  'QyNTUxOQAAACBYo78d27LHMALQTzbrbDH4z2iaVmefzDI3RcxQ2FgmoQAAAJDyyT6C8sk+',
  'ggAAAAtzc2gtZWQyNTUxOQAAACBYo78d27LHMALQTzbrbDH4z2iaVmefzDI3RcxQ2FgmoQ',
  'AAAEADRRfOPWxeSshNKsxiDaTX22WRLB1XLgqCwTr0YLZzlFijvx3bsscwAtBPNutsMfjP',
  'aJpWZ5/MMjdFzFDYWCahAAAABmRlcGxveQECAwQFBgc=',
  '-----END OPENSSH PRIVATE KEY-----',
].join('\n');
/** LEAKED_PRIVATE_KEY の相方の公開鍵（ssh-keygen -y で取り出したもの） */
export const LEAKED_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFijvx3bsscwAtBPNutsMfjPaJpWZ5/MMjdFzFDYWCah deploy';
/** LEAKED_PUBLIC_KEY の指紋（ssh-keygen -lf が出す値）。鍵を替えたら計算し直す（tests/unit/linux-repo.test.ts が確かめる） */
export const LEAKED_FINGERPRINT = 'SHA256:VNwNUi+BdhDixSy6jomQ6NHFOQbbSV1OGWdGxzeL+ZY';
/** 鍵を作り直したあとの公開鍵。秘密の鍵は、どこにも置いていない */
export const ROTATED_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJSHxQMteS2QCyccxdvg+kjtFpG0xTEnbL3UJ9IJceqV deploy';

/** 安全な基準実装：履歴に残った鍵は登録から外してあり、作り直した鍵だけがログインできる */
export const rotatedKeyOnly: AuthorizeDeployKeys = ({ rotated }) => [rotated];

/** コミット 1 つ。files の値が null のファイルは、このコミットで消す */
interface Commit {
  /** 日時（ISO 8601。時差は +09:00 で書く） */
  at: string;
  message: string;
  files: Record<string, string | null>;
}

const DEPLOY_SCRIPT = (key: string): string => ['#!/bin/sh', '# アプリをサーバへ配る', `scp -i ${key} app.sh ${DEPLOY.name}@localhost:app/`].join('\n');

/** リポジトリの履歴。2 つめのコミットで秘密の鍵を入れてしまい、3 つめで消している（消しても、2 つめのコミットには残る） */
const HISTORY: Commit[] = [
  {
    at: '2026-09-28T10:12:00+09:00',
    message: '最初のコミット',
    files: { 'README.md': ['# app', '', '社内向けの小さなアプリ。'].join('\n'), 'app.sh': ['#!/bin/sh', "echo 'app 1.0'"].join('\n') },
  },
  {
    at: '2026-10-02T17:40:00+09:00',
    message: 'デプロイの手順を足す',
    files: { 'deploy.sh': DEPLOY_SCRIPT(KEY_FILE), [KEY_FILE]: LEAKED_PRIVATE_KEY },
  },
  {
    at: '2026-10-05T09:05:00+09:00',
    message: '鍵をリポジトリから消す',
    files: { 'deploy.sh': DEPLOY_SCRIPT('~/.ssh/deploy_key'), [KEY_FILE]: null, '.gitignore': KEY_FILE },
  },
];

const encoder = new TextEncoder();
/** git fast-import の data（バイト数を先に書き、そのあとに中身を置く）。中身は、末尾に改行を 1 つ付けて入れる（改行は、行をつなぐときに付く） */
const data = (text: string): string => `data ${encoder.encode(text).length + 1}\n${text}`;

/** コミットでの、ファイル 1 つの変更。スクリプト（.sh）は、実行できる印を付けて入れる */
function fileChange([path, content]: [string, string | null]): string {
  if (content === null) return `D ${path}`;
  const mode = path.endsWith('.sh') ? '100755' : '100644';
  return [`M ${mode} inline ${path}`, data(content)].join('\n');
}

/**
 * 履歴を、git fast-import が読む形にする。コミットの日時・作者を固定するので、同じ作者なら、だれがいつ作っても同じ履歴（同じコミットの番号）になる。
 * ファイルの中身は、末尾に改行を 1 つ付けて入れる
 */
export function fastImportStream(commits: Commit[], author: string): string {
  return commits
    .map(({ at, message, files }) => {
      const stamp = `${author} ${Date.parse(at) / 1000} +0900`;
      return ['commit refs/heads/main', `author ${stamp}`, `committer ${stamp}`, data(message), ...Object.entries(files).map(fileChange), ''].join('\n');
    })
    .join('\n');
}

/** リポジトリを作るスクリプト。履歴を取り込み、最後のコミットの中身を作業ツリーに出して、持ち主を運用担当にする */
function repoScript(repo: string, owner: string, author: string): string {
  return [
    'export HOME=/root',
    `git init -q --template= -b main ${quote(repo)}`,
    ...heredoc(`git -C ${quote(repo)} fast-import --quiet`, fastImportStream(HISTORY, author)),
    `git -C ${quote(repo)} reset -q --hard`,
    `chown -R ${quote([owner, owner].join(':'))} ${quote(repo)}`,
  ].join('\n');
}

function placeDeployAccount(db: Database, keys: string[]): void {
  addAccount(db, DEPLOY);
  put(db, { path: DEPLOY.home, kind: 'dir', owner: DEPLOY.name, readable: 'all' });
  // 公開鍵は、知られてもログインには使えない。だれでも読めるが、書き換えられるのは本人と root だけ（sshd は、ほかの利用者が書き換えられる一覧を使わない）
  put(db, { path: SSH_DIR, kind: 'dir', owner: DEPLOY.name, readable: 'all' });
  put(db, { path: AUTHORIZED_KEYS, kind: 'file', owner: DEPLOY.name, readable: 'all', content: keys.join('\n') });
}

/**
 * 共通の機械に、デプロイ用の利用者と、運用担当の手元のリポジトリを足す。リポジトリはホームの下に置くので、
 * リポジトリを変える操作（コミット・履歴の書き換え）も、機械の状態の変化として数える（guest/agent の TRACKED）
 */
export const repoAddition: MachineAddition = (db, { operator, admin }, hook) => {
  const repo = `/home/${operator}/app`;
  placeDeployAccount(db, hook<AuthorizeDeployKeys>(DEPLOY_KEYS_HOOK)({ leaked: LEAKED_PUBLIC_KEY, rotated: ROTATED_PUBLIC_KEY }));
  // 運用担当が自分でもコミットできるよう、名前とメールアドレスを設定しておく
  put(db, { path: `/home/${operator}/.gitconfig`, kind: 'file', owner: operator, readable: 'all', content: ['[user]', `\tname = ${operator}`, `\temail = ${operator}@example.test`].join('\n') });
  db.exec({ sql: 'INSERT INTO setup (script) VALUES (?)', bind: [repoScript(repo, operator, `${admin} <${admin}@example.test>`)] });
  return {
    operations: [],
    notes: [
      `- アプリのリポジトリ（git）：${repo}/。デプロイの手順（deploy.sh）も入っている`,
      `- デプロイ：この機械の利用者 ${DEPLOY.name} に、鍵（SSH）でログインして行う。ログインを許す鍵は ${AUTHORIZED_KEYS} に登録してある`,
    ],
    refs: {
      'repo.path': repo,
      'repo.key.name': KEY_FILE,
      'deploy.account.name': DEPLOY.name,
      'deploy.keys.path': AUTHORIZED_KEYS,
      'deploy.leaked.fingerprint': LEAKED_FINGERPRINT,
      // 秘密の鍵の本体の 1 行。端末の出力にこの行が出たら、秘密の鍵そのものが表示されている
      'deploy.leaked.line': LEAKED_PRIVATE_KEY.split('\n')[4] ?? '',
    },
  };
};
