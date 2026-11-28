// ミッション「消した鍵を、使えなくする」（git の履歴に残った秘密の鍵）。秘密の鍵をまちがってコミットし、消すコミットを足しただけのリポジトリがある。
// ターミナルで git の履歴から鍵を取り出し、ssh-keygen で指紋を出して、ログインを許す鍵の一覧（authorized_keys）と見くらべ、まだ使えることを確かめる。
// 直すときは、鍵を作り直して、登録を新しい公開鍵に入れ替える。対策を選ぶのではなく、操作そのものが修正になる（repair: record）。
// 端末の中身は本物の Linux（教材アプリ「Linux 端末」）で、git も ssh-keygen も本物が動く
import { DEPLOY_KEYS_HOOK } from '../../apps/shell/linux/repo';
import { linuxTerminalMission } from '../../apps/shell/scenario';
import type { MissionPack } from '../../platform/contract';
import { IMPLEMENTATIONS } from './implementations';
import { APPROACH, DEBRIEF, HINTS, REPAIR_GUIDE, SOLUTION, TRANSFER_CHECK, WORKED_EXAMPLE } from './learning';
import { CASES, PROBES, TARGET_CASES } from './tests';

export const leakedKeyPack: MissionPack = {
  manifest: {
    schemaVersion: 1,
    id: 'leaked-key',
    version: '1.0.0',
    kind: 'mission',
    title: '消した鍵を、使えなくする',
    summary:
      '秘密の鍵をまちがってコミットし、あとから消したリポジトリを調べます。git の履歴から鍵を取り出せること、その鍵がまだ使えることを確かめて、鍵を作り直します。端末の中では、本物の Linux と本物の git が動きます。',
    learningObjectives: [
      'git log と git show で、消したファイルの中身が履歴に残っていることを確かめられる',
      'ssh-keygen -lf で鍵の指紋を出し、取り出した鍵がまだ登録されているかを見くらべられる',
      '漏れた鍵は、消すのではなく、登録から外して作り直すと説明できる',
    ],
    estimatedMinutes: 20,
    vulnerability: { name: '履歴に残った鍵', plain: '消したはずの秘密の鍵が、git の履歴から取り出せて、まだ使える問題', fullName: 'ソースコードに含まれた秘密の情報', cwe: 'CWE-540', category: 'misconfiguration' },
    difficulty: 'intermediate',
    story: {
      workedExample: WORKED_EXAMPLE,
      requester: { name: '堀さん', role: 'アプリの開発者' },
      incident:
        '開発者の堀さんから依頼がありました。「デプロイ用の秘密の鍵を、まちがってリポジトリにコミットしてしまいました。すぐに気づいて、鍵を消すコミットを足してあります。これで大丈夫でしょうか。調べてください」',
      goal: 'リポジトリの履歴から取り出せる鍵では、デプロイ用の利用者にログインできないようにします。デプロイは、新しい鍵で続けられるようにします。',
      protectedAssets: ['デプロイ用の利用者（deploy）へのログイン'],
      normalUse: ['デプロイ用の利用者に、ログインに使える鍵が登録されている', '運用担当は、リポジトリの履歴を読める'],
    },
    // 調べるのも直すのも、ターミナルにコマンドを打って行う。ホームやリポジトリ、鍵の一覧を変えた操作だけを記録する。
    // 取り出した鍵を /tmp に置く操作は、機械の状態の変化に数えないので記録しない
    ...linuxTerminalMission({
      versions: '^1.7.0',
      features: ['terminal', 'sudo', 'git'],
      fixture: 'linux.repo',
      // 履歴に残っている鍵を、ログインを許す鍵の一覧に登録したままにする
      recipe: { id: 'leaked-key-still-authorized', version: '1.0.0', hook: DEPLOY_KEYS_HOOK, implementation: 'leaked-key/leaked-key-still-authorized' },
      probes: PROBES,
      targets: TARGET_CASES,
      cases: CASES,
    }),
    approach: APPROACH,
    repairGuide: REPAIR_GUIDE,
    hints: HINTS,
    solution: SOLUTION,
    transferCheck: TRANSFER_CHECK,
    debrief: DEBRIEF,
  },
  implementations: IMPLEMENTATIONS,
};
