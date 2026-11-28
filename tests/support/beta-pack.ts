// ベータ版のテスト専用パック。設定で表示を有効にするまで一覧に出ないことを確かめる。演習は始められない（壊れた検証用パックと同じ中身）
import type { MissionPack } from '../../platform/contract';
import { brokenPack } from './broken-pack';

export const betaPack: MissionPack = {
  manifest: { ...brokenPack.manifest, id: 'test-beta', title: 'ベータ版の検証用パック', release: 'beta' },
  implementations: {},
};
