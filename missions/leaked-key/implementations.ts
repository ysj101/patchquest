// 履歴に残った鍵のパックの実装。注入するのは、配備時に、デプロイ用の利用者へのログインを許す公開鍵を決める処理（初期データ生成器が呼ぶ）。
// 安全な状態との差は、この処理が作る初期データ（authorized_keys の中身）の差として入る
import { DEPLOY_KEYS_HOOK, type AuthorizeDeployKeys } from '../../apps/shell/linux/repo';
import type { ImplementationRegistry } from '../../platform/contract';

/** 注入する問題：鍵のファイルをリポジトリから消しただけで、鍵を作り直していない。履歴に残っている鍵が、登録されたままになっている */
const leakedKeyStillAuthorized: AuthorizeDeployKeys = ({ leaked }) => [leaked];

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'leaked-key/leaked-key-still-authorized': { hook: DEPLOY_KEYS_HOOK, run: leakedKeyStillAuthorized },
};
