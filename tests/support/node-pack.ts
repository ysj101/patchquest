// Orchestrator を描画なしで検証するための、共通の課題パック。
import type { MissionPack } from '../../platform/contract';
import { requestOnly } from './request-only';
import { testPack } from './test-pack';

export const nodePack: MissionPack = {
  ...testPack,
  manifest: {
    ...testPack.manifest,
    runtime: { adapter: 'browser', capabilities: ['sqlite'] },
    hooks: testPack.manifest.hooks.filter((hook) => hook.id !== 'note.render'),
    tests: { ...testPack.manifest.tests, cases: requestOnly(testPack.manifest.tests.cases) },
  },
};
