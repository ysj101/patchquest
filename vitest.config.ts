import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@catalog': resolve('tests/support/catalog.ts') },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text-summary', 'text'],
      include: ['platform/**/*.ts', 'runtimes/**/*.ts', 'apps/**/*.ts', 'missions/**/*.ts', 'catalog/**/*.ts'],
      // 画面・Worker・iframe・DOM に触れるコードは E2E（tests/e2e）で確かめる
      exclude: [
        'platform/main.ts',
        'platform/ui/**',
        'apps/memo/view.ts',
        'apps/shared/dom.ts',
        'runtimes/browser/adapter.ts',
        'runtimes/browser/lockdown.ts',
        'runtimes/browser/preview-host.ts',
        'runtimes/browser/worker.ts',
        'runtimes/browser/preview/**',
      ],
      // 導入時点の値。下がったら失敗する。上がったら数字を引き上げる
      thresholds: { statements: 87, branches: 78, functions: 87, lines: 92 },
    },
  },
});
