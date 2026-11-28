import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@catalog': resolve('tests/support/catalog.ts') },
  },
  test: {
    // 共通のテストと、課題パックの固有テスト（missions/<課題>/__tests__）
    include: ['tests/unit/**/*.test.ts', 'missions/*/__tests__/**/*.test.ts'],
    environment: 'node',
    // 演習用の機械（本物の Linux）の配布物を、テストの前に用意する
    globalSetup: ['tests/support/machine-setup.ts'],
    coverage: {
      reporter: ['text-summary', 'text'],
      include: ['platform/**/*.ts', 'runtimes/**/*.ts', 'apps/**/*.ts', 'missions/**/*.ts', 'catalog/**/*.ts'],
      // 画面・Worker・iframe・DOM に触れるコードは E2E（tests/e2e）で確かめる
      exclude: [
        // 課題パックの開発用の領域はテストそのもので、製品コードではない
        'missions/*/__tests__/**',
        'platform/main.ts',
        'platform/ui/**',
        'apps/memo/view.ts',
        'apps/memo/token-view.ts',
        'apps/shell/view.ts',
        'apps/shell/editor-view.ts',
        'apps/shared/dom.ts',
        'runtimes/browser/adapter.ts',
        'runtimes/browser/lockdown.ts',
        'runtimes/browser/preview-host.ts',
        'runtimes/browser/worker.ts',
        'runtimes/browser/preview/**',
      ],
      // 下がったら失敗する。上がったら数字を引き上げる（2026-11-23 時点の実測は 95.0・90.9・95.0・97.5）
      thresholds: { statements: 94, branches: 90, functions: 94, lines: 97 },
    },
  },
});
