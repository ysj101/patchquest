// 教材アプリ「Linux 端末」が公開する交換点（フック）と、その安全な基準実装。処理の形は擬似シェルと同じ
import type { HookDescriptor, ImplementationRegistry } from '../../../platform/contract';
import { leastPrivilege } from '../hooks';

/** 配備時に、運用担当へ sudo で許可するコマンドを決める処理（apps/shell/hooks.ts の ProvisionSudoers）。契約 1 */
export const PROVISION_HOOK = 'linux.sudoers.provision';

export const HOOKS: HookDescriptor[] = [
  {
    id: PROVISION_HOOK,
    realm: 'server',
    contract: 1,
    baseline: 'linux/sudoers-least-privilege',
    description: '配備時に、運用担当へ sudo で許可するコマンドを決める処理（設定ファイルの本文になる）',
  },
];

export const BASELINE: ImplementationRegistry = {
  'linux/sudoers-least-privilege': { hook: PROVISION_HOOK, run: leastPrivilege },
};
