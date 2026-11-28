// 履歴に残った鍵のパックの、攻撃の成立条件と固有のテスト。鍵が使えるかどうかは、sshd と同じく、ログインを許す鍵の一覧（authorized_keys）に
// その鍵が登録されているかで決める。本物の ssh-keygen が出す指紋で確かめる。利用者名・パスは fixture の値で参照する
import { FAILED, SUCCEEDED, sh } from '../../apps/shell/scenario';
import type { ProbeDef, ResponseExpectation, TestCase } from '../../platform/contract';

const REPO = '{{repo.path}}';
const KEYS = '{{deploy.keys.path}}';
const LEAKED_FINGERPRINT = '{{deploy.leaked.fingerprint}}';

/** コマンドが成功し、出力に text が含まれる */
const printed = (text: string): ResponseExpectation => ({ status: 200, body: [{ path: 'exit', is: { equals: 0 } }, { path: 'stdout', is: { contains: text } }] });

/** 端末の出力に、秘密の鍵の本体の行が出た */
const PRIVATE_KEY_SHOWN = printed('{{deploy.leaked.line}}');

export const PROBES: ProbeDef[] = [
  {
    id: 'deleted-key-recovered',
    title: '消したはずの秘密の鍵を履歴から取り出せて、その鍵がまだ登録されている',
    steps: [sh('operator', `git -C ${REPO} log -p`, PRIVATE_KEY_SHOWN), sh('operator', `ssh-keygen -lf ${KEYS}`, printed(LEAKED_FINGERPRINT))],
    // リポジトリを読める人ならだれでも取り出せるので、利用者は問わない。取り出し方（git log -p・git show など）も問わず、
    // 端末に秘密の鍵そのものが出たことで判定する。いまのファイルからは消してあるので、出どころは履歴しかない
    detect: { request: { method: 'POST', path: '/sh' }, response: PRIVATE_KEY_SHOWN },
  },
];

/** 攻撃阻止（脆弱な状態では失敗する） */
export const TARGET_CASES: TestCase[] = [
  {
    id: 'leaked-key.leaked-key-revoked',
    category: 'security',
    title: '履歴に残っている鍵は、デプロイ用の利用者に登録されていない',
    // 新しい鍵を足しただけ・リポジトリや履歴から消しただけでは、古い鍵の登録が残る。登録されている鍵の指紋に、履歴に残っている鍵の指紋がないことを確かめる。
    // 一覧を読めないようにしてあっても確かめられるよう、管理者が sudo で読む
    steps: [sh('admin', `sudo ssh-keygen -lf ${KEYS} | grep -qF '${LEAKED_FINGERPRINT}'`, FAILED)],
  },
];

export const CASES: TestCase[] = [
  ...TARGET_CASES,
  {
    id: 'leaked-key.deploy-key-registered',
    category: 'normal',
    title: 'デプロイ用の利用者に、ログインに使える鍵が登録されている',
    // 登録を空にする・一覧を消すと、だれもデプロイできなくなる
    steps: [sh('admin', `sudo ssh-keygen -lf ${KEYS}`, SUCCEEDED)],
  },
  {
    id: 'leaked-key.history-readable',
    category: 'normal',
    title: '運用担当は、リポジトリの履歴を読める',
    steps: [sh('operator', `git -C ${REPO} log --oneline`, SUCCEEDED)],
  },
  {
    id: 'leaked-key.keys-protected',
    category: 'security',
    title: '運用担当は、ログインを許す鍵の一覧を書き換えられない',
    steps: [sh('operator', `echo x >> ${KEYS}`, FAILED)],
  },
];
