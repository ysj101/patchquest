// 注入しても攻撃が成立しない、壊れたテスト専用パック。開始前チェックで止まることを確かめる
import type { MissionPack } from '../../platform/contract';
import { testPack } from './test-pack';

export const brokenPack: MissionPack = {
  ...testPack,
  manifest: {
    ...testPack.manifest,
    id: 'test-broken',
    title: '壊れた検証用パック',
    mutationRecipes: testPack.manifest.mutationRecipes.map((r) => ({ ...r, apply: [{ hook: 'note.read', implementation: 'test-app/owner-only' }] })),
  },
};
