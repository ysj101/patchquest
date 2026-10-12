// 配布物（ZIP を展開したもの）を、localhost 限定の静的サーバで開いて確かめる（pnpm run test:dist）
import { defineConfig } from '@playwright/test';
import { BROWSERS } from './playwright.config';
import { releaseName, unpackDir } from './scripts/release.mjs';

const port = 4174;

export default defineConfig({
  testDir: 'tests/e2e-dist',
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: BROWSERS,
  // 毎回展開し直した配布物を配信するため、起動中のサーバは使い回さない
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory ${unpackDir}/${releaseName}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
