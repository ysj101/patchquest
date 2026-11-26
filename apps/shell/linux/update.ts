// 更新の取り込みを持つ機械の初期データ。共通の機械に、受け取った更新の置き場・配布元が知らせたハッシュの一覧（SHA256SUMS）・
// 取り込むプログラムを足す。取り込みは本物のシェルスクリプトで、中身の確かめは本物の sha256sum -c が行う。
// 取り込みのプログラムが、動かす前に確かめるかどうかは、交換点が決める
import type { Database } from '../../../runtimes/browser/sqlite';
import { put, putProgram, type MachineAddition } from '../fixtures';
import { ROOT } from '../model';

/**
 * 配備時に、取り込みのプログラムが更新を動かす前に行う確認を決める処理。
 * 返した行が、取り込みのプログラム（シェルスクリプト）の、置き場へ移る行と更新を動かす行の間に入る。契約 1
 */
export const UPDATE_HOOK = 'linux.update.verify';
export type VerifyUpdate = () => string[];

const CACHE_DIR = '/var/cache/updates';
const UPDATE_NAME = 'update.sh';
const SUMS_DIR = '/etc/updates';
/** 配布元が知らせたハッシュの一覧。名前と書式は、配布元がダウンロードするファイルと並べて公開するもの（SHA256SUMS）と同じ */
const UPDATE_SUMS = `${SUMS_DIR}/SHA256SUMS`;
const APPLY = '/usr/local/bin/apply-update';

/** 配布元が出した更新の中身。機械に置くと、末尾に改行が 1 つ付く */
export const UPDATE_BODY = ['#!/bin/sh', '# 更新 2026.10（配布元が出したもの）', "echo '更新 2026.10 を取り込みました'"].join('\n');
/** UPDATE_BODY に改行を 1 つ足したものの SHA-256。中身を変えたら計算し直す（tests/unit/linux-update.test.ts が確かめる） */
export const UPDATE_SHA256 = 'c067468ede5b05941adf62383a594ca3c636e640caaf01dec3281f30ab2ee1ec';

/** 安全な基準実装：動かす前に、中身を一覧と照らし合わせる。合わなければ、取り込まずに終わる */
export const verifyBeforeApply: VerifyUpdate = () => [
  '# 動かす前に、更新の中身が配布元の一覧と同じかを確かめる。合わなければ、ここでやめる',
  `sha256sum -c ${UPDATE_SUMS} || exit 1`,
];

/** 置き場の更新を root の権限で取り込むシェルスクリプト。checks は、動かす前に行う確認の行 */
const applyScript = (checks: string[]): string => [`cd ${CACHE_DIR} || exit 1`, ...checks, `sh ./${UPDATE_NAME}`].join('\n');

function placeUpdate(db: Database, operator: string): void {
  put(db, { path: '/var/cache', kind: 'dir', owner: ROOT, readable: 'all' });
  // 置き場と受け取った更新は、受け取って置く運用担当のもの
  put(db, { path: CACHE_DIR, kind: 'dir', owner: operator, readable: 'all' });
  put(db, { path: `${CACHE_DIR}/${UPDATE_NAME}`, kind: 'file', owner: operator, readable: 'all', content: UPDATE_BODY });
  // 一覧は、配布元の知らせから管理者が写したもの。運用担当には書き換えられない
  put(db, { path: SUMS_DIR, kind: 'dir', owner: ROOT, readable: 'all' });
  put(db, { path: UPDATE_SUMS, kind: 'file', owner: ROOT, readable: 'all', content: `${UPDATE_SHA256}  ${UPDATE_NAME}` });
}

/**
 * 共通の機械に、更新の取り込みを足す。取り込みは運用担当の日常の操作になる。
 * 置き場（/var/cache）の中の変化は、機械の状態の変化として数えない（guest/agent の TRACKED）。受け取った更新を置く・書き換える操作は、
 * 修正の記録には残らない
 */
export const updateAddition: MachineAddition = (db, { operator }, hook) => {
  placeUpdate(db, operator);
  putProgram(db, APPLY, true, '', applyScript(hook<VerifyUpdate>(UPDATE_HOOK)()));
  return {
    operations: [APPLY],
    notes: [
      `- 更新の取り込み：配布元から受け取った更新を ${CACHE_DIR}/ に置き、sudo ${APPLY} で取り込む`,
      `- 配布元が知らせた更新のハッシュ（SHA-256）は、管理者が ${UPDATE_SUMS} に写してある`,
    ],
    refs: { 'programs.update.path': APPLY, 'updates.dir.path': CACHE_DIR, 'updates.file.path': `${CACHE_DIR}/${UPDATE_NAME}`, 'updates.sums.path': UPDATE_SUMS },
  };
};
