import { describe, expect, it } from 'vitest';
import { findBoundaryViolations } from '../../scripts/check-boundaries.mjs';

const file = (path: string, content: string) => ({ path, content });

describe('findBoundaryViolations', () => {
  it('課題同士・プラットフォームから課題やアプリへの読み込みを検出する', () => {
    const violations = findBoundaryViolations(
      [
        file('missions/xss/index.ts', "import { idorPack } from '../idor';\nimport type { X } from '../../runtimes/browser/app-module';"),
        file('missions/idor/index.ts', "import { Orchestrator } from '../../platform/orchestrator/orchestrator';"),
        file('platform/ui/app.ts', "import { idorPack } from '../../missions/idor';\nimport { catalog } from '../../catalog';"),
        file('runtimes/browser/registry.ts', "const m = await import('../../apps/memo');"),
        file('apps/memo/server.ts', "export { onboardingPack } from '../../missions/onboarding';\nimport '../wiki/model';"),
      ],
      [],
    );
    expect(violations).toEqual([
      expect.stringMatching(/^missions\/xss\/index\.ts:1: 課題は他の課題に依存できません/),
      expect.stringMatching(/^missions\/xss\/index\.ts:2: 課題が読み込めるのは/),
      expect.stringMatching(/^missions\/idor\/index\.ts:1: 課題が読み込めるのは/),
      expect.stringMatching(/^platform\/ui\/app\.ts:1: 個別の課題・教材アプリに直接依存しています/),
      expect.stringMatching(/^platform\/ui\/app\.ts:2: カタログは @catalog で読み込みます/),
      expect.stringMatching(/^runtimes\/browser\/registry\.ts:1: 個別の課題・教材アプリに直接依存しています/),
      expect.stringMatching(/^apps\/memo\/server\.ts:1: 教材アプリは課題・カタログに依存できません/),
      expect.stringMatching(/^apps\/memo\/server\.ts:2: 教材アプリは他のアプリに依存できません/),
    ]);
  });

  it('決まった読み込み（契約・教材アプリ・同じ課題の中・@catalog・外部パッケージ）は許可する', () => {
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
      ['idor'],
    );
    expect(violations).toEqual([]);
  });

  it('コア（プラットフォーム・実行環境・教材アプリ）に書いた課題 ID を検出する。課題の中では書ける', () => {
    const violations = findBoundaryViolations(
      [
        file('platform/ui/app.ts', "if (pack.manifest.id === 'idor') {}\nconst note = 'idor の課題';"),
        file('apps/memo/view.ts', 'const id = `onboarding`;'),
        file('missions/idor/index.ts', "export const id = 'idor';"),
      ],
      ['idor', 'onboarding'],
    );
    expect(violations).toEqual([
      expect.stringMatching(/^platform\/ui\/app\.ts:1: 課題 ID「idor」を書いています/),
      expect.stringMatching(/^apps\/memo\/view\.ts:1: 課題 ID「onboarding」を書いています/),
    ]);
  });
});
