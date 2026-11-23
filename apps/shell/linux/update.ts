// 更新の取り込みを持つ機械の初期データ。共通の機械に、受け取った更新の置き場・取り込むプログラム・中身を確かめる設定を足す。
// 取り込みは本物のシェルスクリプトで、中身の確かめは本物の sha256sum が行う。確かめるかどうかの設定は、交換点が決める
import type { Database } from '../../../runtimes/browser/sqlite';
import { put, putProgram, type MachineAddition } from '../fixtures';
import { ROOT } from '../model';

/** 配備時に、更新の取り込みの設定を決める処理。返した行が設定ファイル（UPDATE_CONFIG）の本文になる。契約 1 */
export const UPDATE_HOOK = 'linux.update.configure';
export type ConfigureUpdate = () => string[];

const CACHE_DIR = '/var/cache/updates';
const UPDATE_NAME = 'update.sh';
const UPDATE_CONFIG = '/etc/update.conf';
const UPDATE_SUMS = '/etc/update.sums';
const APPLY = '/usr/local/bin/apply-update';

/** 配布元が出した更新の中身。機械に置くと、末尾に改行が 1 つ付く */
export const UPDATE_BODY = ['#!/bin/sh', '# 更新 2026.10（配布元が出したもの）', "echo '更新 2026.10 を取り込みました'"].join('\n');
/** UPDATE_BODY に改行を 1 つ足したものの SHA-256。中身を変えたら計算し直す（tests/unit/linux-update.test.ts が確かめる） */
export const UPDATE_SHA256 = 'c067468ede5b05941adf62383a594ca3c636e640caaf01dec3281f30ab2ee1ec';

/** 設定の先頭に置く説明 */
const CONFIG_HEADING = [
  '# 更新の取り込み（apply-update）の設定',
  `# verify=on  … 取り込む前に、更新の中身を一覧（${UPDATE_SUMS}）と照らし合わせる`,
  '# verify=off … 照らし合わせずに取り込む',
];

/** 安全な基準実装：取り込む前に、中身を一覧と照らし合わせる */
export const verifyBeforeApply: ConfigureUpdate = () => ['verify=on'];

/**
 * 置き場の更新を root の権限で取り込む。設定で切られていなければ、中身を一覧と照らし合わせ、合わなければ取り込まない。
 * 設定や一覧を読めないときも、取り込まない
 */
const APPLY_SCRIPT = [
  `cd ${CACHE_DIR} || exit 1`,
  `if grep -qx 'verify=off' ${UPDATE_CONFIG}; then`,
  `  echo '中身の確認：しない（${UPDATE_CONFIG} が verify=off）'`,
  `elif ! sha256sum -c ${UPDATE_SUMS}; then`,
  '  echo "$0: 更新の中身が一覧と合いません。取り込みをやめました" >&2',
  '  exit 1',
  'fi',
  `sh ./${UPDATE_NAME}`,
].join('\n');

function placeUpdate(db: Database, operator: string): void {
  put(db, { path: '/var/cache', kind: 'dir', owner: ROOT, readable: 'all' });
  // 置き場と受け取った更新は、受け取って置く運用担当のもの
  put(db, { path: CACHE_DIR, kind: 'dir', owner: operator, readable: 'all' });
  put(db, { path: `${CACHE_DIR}/${UPDATE_NAME}`, kind: 'file', owner: operator, readable: 'all', content: UPDATE_BODY });
  // 一覧は、配布元の知らせから管理者が写したもの。運用担当には書き換えられない
  put(db, { path: UPDATE_SUMS, kind: 'file', owner: ROOT, readable: 'all', content: `${UPDATE_SHA256}  ${UPDATE_NAME}` });
}

/**
 * 共通の機械に、更新の取り込みを足す。取り込みは運用担当の日常の操作になる。
 * 置き場（/var/cache）の中の変化は、機械の状態の変化として数えない（guest/agent の TRACKED）。受け取った更新を置く・書き換える操作は、
 * 修正の記録には残らない
 */
export const updateAddition: MachineAddition = (db, { operator }, hook) => {
  const settings = hook<ConfigureUpdate>(UPDATE_HOOK)();
  if (!settings.some((line) => /^verify=(?:on|off)$/.test(line))) throw new Error(`${UPDATE_HOOK} が返した設定に、verify=on か verify=off の行がありません`);
  placeUpdate(db, operator);
  put(db, { path: UPDATE_CONFIG, kind: 'file', owner: ROOT, readable: 'all', content: [...CONFIG_HEADING, ...settings].join('\n') });
  putProgram(db, APPLY, true, '', APPLY_SCRIPT);
  return {
    operations: [APPLY],
    notes: [`- 更新の取り込み：配布元から受け取った更新を ${CACHE_DIR}/ に置き、sudo ${APPLY} で取り込む`],
    refs: { 'programs.update.path': APPLY, 'updates.file.path': `${CACHE_DIR}/${UPDATE_NAME}`, 'updates.config.path': UPDATE_CONFIG, 'updates.sums.path': UPDATE_SUMS },
  };
};
