// sudo の設定ミスのパックの実装。注入するのは、配備時に運用担当へ許可するコマンドを決める処理（初期データ生成器が呼ぶ）。
// 設定ミスはコードのバグではないので、安全な状態との差は、この処理が作る初期データ（設定ファイルの中身）の差として入る
import type { ProvisionSudoers } from '../../apps/shell/hooks';
import type { ImplementationRegistry } from '../../platform/contract';

/**
 * 注入する設定ミス：日常の運用操作の行に加えて、管理者だけが行う保守の操作まで運用担当に許可する行を足す。
 * 設定ファイルは 1 行目が見出し、2 行目が日常の運用操作、3 行目が保守の操作になる
 */
const grantMaintenanceToo: ProvisionSudoers = ({ operator, operations, maintenance }) => [
  `${operator} ALL=(root) NOPASSWD: ${operations.join(', ')}`,
  `${operator} ALL=(root) NOPASSWD: ${maintenance.join(', ')}`,
];

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'sudo-misconfig/grant-maintenance-too': { hook: 'shell.sudoers.provision', run: grantMaintenanceToo },
};
