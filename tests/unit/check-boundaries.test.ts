import { describe, expect, it } from 'vitest';
import { findBoundaryViolations } from '../../scripts/check-boundaries.mjs';

const file = (path: string, content: string) => ({ path, content });
const ALIASES = ['@catalog'];

describe('findBoundaryViolations', () => {
  it('許可した先以外の読み込みを検出する（課題同士、コアから課題・アプリ、アプリ同士など）', () => {
    const violations = findBoundaryViolations(
      [
        file('missions/xss/index.ts', "import { idorPack } from '../idor';\nimport type { X } from '../../runtimes/browser/app-module';"),
        file('missions/idor/index.ts', "import { Orchestrator } from '../../platform/orchestrator/orchestrator';\nimport { helper } from '../../scripts/scan.mjs';"),
        file('platform/ui/app.ts', "import { idorPack } from '../../missions/idor';\nimport { catalog } from '../../catalog';"),
        file('runtimes/browser/registry.ts', "const m = await import('../../apps/memo');"),
        file('apps/memo/server.ts', "export { onboardingPack } from '../../missions/onboarding';\nimport '../wiki/model';\nimport { catalog } from '@catalog';"),
      ],
      ALIASES,
    );
    expect(violations.map((v) => v.split(' は読み込めません')[0])).toEqual([
      'missions/xss/index.ts:1: ../idor',
      'missions/xss/index.ts:2: ../../runtimes/browser/app-module',
      'missions/idor/index.ts:1: ../../platform/orchestrator/orchestrator',
      'missions/idor/index.ts:2: ../../scripts/scan.mjs',
      'platform/ui/app.ts:1: ../../missions/idor',
      'platform/ui/app.ts:2: ../../catalog',
      'runtimes/browser/registry.ts:1: ../../apps/memo',
      'apps/memo/server.ts:1: ../../missions/onboarding',
      'apps/memo/server.ts:2: ../wiki/model',
      'apps/memo/server.ts:3: @catalog',
    ]);
    expect(violations[0]).toMatch(/missions から読み込めるのは 自分のディレクトリ・platform\/contract・apps）$/);
  });

  it('許可した読み込み（契約・教材アプリ・同じ課題の中・@catalog・外部パッケージ）は通す', () => {
    const violations = findBoundaryViolations(
      [
        file(
          'missions/idor/index.ts',
          "import type { MissionPack } from '../../platform/contract';\nimport type { ReadMemo } from '../../apps/memo/hooks';\nimport { DIFF } from './diff';",
        ),
        file('missions/idor/diff.ts', "import { RESULT_GROUPS } from '../../platform/contract/attempt';"),
        file('platform/ui/app.ts', "import { catalog } from '@catalog';\nimport { BrowserRuntimeAdapter } from '../../runtimes/browser/adapter';"),
        file('apps/memo/view.ts', "import { el } from '../shared/dom';\nimport type { ViewContext } from '../../runtimes/browser/app-module';"),
        file('runtimes/browser/sqlite.ts', "import sqlite3InitModule from '@sqlite.org/sqlite-wasm';"),
      ],
      ALIASES,
    );
    expect(violations).toEqual([]);
  });

  it('プラットフォーム・実行環境にある課題 ID での分岐を検出する', () => {
    const violations = findBoundaryViolations(
      [
        file('platform/ui/app.ts', "if (pack.manifest.id === 'idor') {}\nconst p = catalog.packs.find((p) => 'xss' !== p.manifest.id);"),
        file('runtimes/browser/engine.ts', 'switch (attempt.missionId) {}'),
        file('platform/ui/list.ts', "const same = record.missionId === pack.manifest.id;\nconst label = 'search';"),
        file('missions/idor/index.ts', "if (manifest.id === 'idor') {}"),
      ],
      ALIASES,
    );
    expect(violations.map((v) => v.split(': 課題 ID')[0])).toEqual(['platform/ui/app.ts:1', 'platform/ui/app.ts:2', 'runtimes/browser/engine.ts:1']);
  });
});
