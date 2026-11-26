// 出荷前検証の対象。同梱のパックと、基準となるテスト専用パックを、対応する教材アプリと組にして並べる。
// 検証ページ（tests/pages/pack-verification.ts）と E2E のテスト一覧（tests/e2e/pack-verification.spec.ts）が同じものを使い、
// パックをカタログに足したら検証のテストも自動で増えるようにする
import { shellApp } from '../../apps/shell';
import { catalog as bundled } from '../../catalog';
import { testApp } from './test-app';
import { testPack } from './test-pack';
import { shellTestPack } from './shell-pack';

export const verificationCatalog = { apps: [...bundled.apps, shellApp, testApp], packs: [...bundled.packs, testPack, shellTestPack] };
