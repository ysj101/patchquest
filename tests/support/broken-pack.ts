// 注入しても攻撃が成立しない、壊れたテスト専用パック。開始前チェックで止まることを確かめる
import type { MissionPack } from '../../platform/contract';
import { testPack } from './test-pack';

// 他のパックの実装は使えないため、実装を持たず、教材アプリの実装だけを参照する
export const brokenPack: MissionPack = {
  manifest: {
    ...testPack.manifest,
    id: 'test-broken',
    title: '壊れた検証用パック',
    mutationRecipes: testPack.manifest.mutationRecipes.map((r) => ({ ...r, apply: [{ hook: 'note.read', implementation: 'test-app/owner-only' }] })),
    defenses: testPack.manifest.defenses.filter((d) => d.apply.every((c) => c.implementation.startsWith('test-app/'))),
  },
  implementations: {},
};
