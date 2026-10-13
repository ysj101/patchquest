// 同梱する教材アプリと課題パックの登録。パックの追加はここへの登録だけで行い、
// コアUIに課題 ID の分岐を入れない（spec §11.3）
import { memoApp } from '../apps/memo';
import { idorPack } from '../missions/idor';
import { onboardingPack } from '../missions/onboarding';
import { storedXssPack } from '../missions/stored-xss';
import { sqliPack } from '../missions/sqli';
import type { Catalog } from '../runtimes/browser/app-module';

export const catalog: Catalog = {
  apps: [memoApp],
  packs: [onboardingPack, idorPack, storedXssPack, sqliPack],
};
