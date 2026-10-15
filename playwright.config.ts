// 通常の E2E と、動きを抑えた環境での完走確認を設定する。
import { defineConfig } from '@playwright/test';

const port = 4173;

/** 対応ブラウザはPC版のChromeのみ（spec §2）。インストール済みのブラウザを使う */
export const BROWSERS = [{ name: 'chrome', use: { channel: 'chrome' } }];

export default defineConfig({
  // 共通の E2E と、課題パックの固有の E2E（missions/<課題>/__tests__）
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.ts', 'missions/*/__tests__/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    ...BROWSERS,
    {
      name: 'chrome-quiet',
      use: { channel: 'chrome', contextOptions: { reducedMotion: 'reduce' } },
      testMatch: ['missions/idor/__tests__/idor.spec.ts', 'tests/e2e/stored-xss.spec.ts', 'tests/e2e/sqli.spec.ts', 'tests/e2e/onboarding.spec.ts'],
    },
  ],
  // 配布物と同じく、ビルド成果物をlocalhost限定の静的サーバで配信する
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
