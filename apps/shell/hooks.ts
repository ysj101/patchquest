// 擬似シェルが公開する交換点（フック）と、その安全な基準実装
import type { HookDescriptor, ImplementationRegistry } from '../../platform/contract';

/**
 * 配備時に、運用担当へ sudo で許可するコマンドを決める処理。返した行が運用担当向けの設定ファイルの本文になる。
 * 初期データ生成器が呼ぶので、課題パックが注入した実装なら、過剰な許可が初期データとして入る（設定ミスはコードではなくデータの差）。
 * operations は運用担当の日常の操作、maintenance は管理者だけが行う保守の操作（いずれも絶対パス）。契約 1
 */
export type ProvisionSudoers = (input: { operator: string; operations: string[]; maintenance: string[] }) => string[];

export const HOOKS: HookDescriptor[] = [
  {
    id: 'shell.sudoers.provision',
    realm: 'server',
    contract: 1,
    baseline: 'shell/sudoers-least-privilege',
    description: '配備時に、運用担当へ sudo で許可するコマンドを決める処理（設定ファイルの本文になる）',
  },
];

/** 最小権限：運用担当には、日常の運用操作だけを許可する */
const leastPrivilege: ProvisionSudoers = ({ operator, operations }) => [`${operator} ALL=(root) NOPASSWD: ${operations.join(', ')}`];

export const BASELINE: ImplementationRegistry = {
  'shell/sudoers-least-privilege': { hook: 'shell.sudoers.provision', run: leastPrivilege },
};
