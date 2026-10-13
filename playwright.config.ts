import { defineConfig } from '@playwright/test';

const port = 4173;

/** 対応ブラウザはPC版のChrome・Edge（spec §2）。インストール済みのブラウザを使う */
export const BROWSERS = [
  { name: 'chrome', use: { channel: 'chrome' } },
  { name: 'msedge', use: { channel: 'msedge' } },
];

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
  projects: BROWSERS,
  // 配布物と同じく、ビルド成果物をlocalhost限定の静的サーバで配信する
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
