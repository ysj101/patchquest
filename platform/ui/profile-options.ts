// カタログから、XP・実績・習熟度の計算に使う課題の一覧（ID と脆弱性の分類）を作る
import { catalog } from '@catalog';
import type { ProfileOptions } from '../progress/profile';

const missionPacks = catalog.packs.filter((pack) => pack.manifest.kind === 'mission');

export const profileOptions: ProfileOptions = {
  missionIds: missionPacks.map((pack) => pack.manifest.id),
  categories: Object.fromEntries(missionPacks.flatMap((pack) => (pack.manifest.vulnerability ? [[pack.manifest.id, pack.manifest.vulnerability.category]] : []))),
};
