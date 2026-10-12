// 同梱する教材アプリと課題パックの登録。パックの追加はここへの登録だけで行い、
// コアUIに課題 ID の分岐を入れない（spec §11.3）
import type { Catalog } from '../runtimes/browser/app-module';

export const catalog: Catalog = {
  apps: [],
  packs: [],
};
