// テスト用ビルド（--test）のカタログ。同梱分にテスト専用のアプリとパックを加える
import { catalog as bundled } from '../../catalog';
import type { Catalog } from '../../runtimes/browser/app-module';
import { testApp } from './test-app';
import { testPack } from './test-pack';

export const catalog: Catalog = {
  apps: [...bundled.apps, testApp],
  packs: [...bundled.packs, testPack],
};
