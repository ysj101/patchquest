// 教材アプリ「Linux 端末」が公開する交換点（フック）と、その安全な基準実装。処理の形は擬似シェルと同じ
import type { HookDescriptor, ImplementationRegistry } from '../../../platform/contract';
import { leastPrivilege } from '../hooks';
import { UPDATE_HOOK, verifyBeforeApply } from './update';

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
  {
    id: UPDATE_HOOK,
    realm: 'server',
    contract: 1,
    baseline: 'linux/update-verify',
    description: '配備時に、取り込みのプログラムが更新を動かす前に行う確認を決める処理（取り込みのプログラムの行になる。更新の取り込みを持つ機械だけが使う）',
  },
];

export const BASELINE: ImplementationRegistry = {
  'linux/sudoers-least-privilege': { hook: PROVISION_HOOK, run: leastPrivilege },
  'linux/update-verify': { hook: UPDATE_HOOK, run: verifyBeforeApply },
};
