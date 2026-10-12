// 配布物（ZIP を展開したもの）を、localhost 限定の静的サーバで開いて確かめる（npm run test:dist）
import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const port = 4174;

export default defineConfig({
  testDir: 'tests/e2e-dist',
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'msedge', use: { channel: 'msedge' } },
  ],
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory release/unpacked/patchquest-${version}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
