// 通常の E2E と、動きを抑えた環境での完走確認を設定する。
import { createHash } from 'node:crypto';
import { defineConfig } from '@playwright/test';

/**
 * 作業場所（リポジトリを置いたディレクトリ）ごとに決まるポート。git worktree を並べて E2E を走らせたとき、
 * 別の作業場所のビルドを配信するサーバにつながらないようにする
 */
export const portFor = (base: number): number => base + (createHash('sha256').update(process.cwd()).digest().readUInt16BE(0) % 500);

const port = portFor(4173);

/**
 * 演習用の機械（本物の Linux を動かすエミュレータ）を起動するテストに付ける印。機械は CPU を使い切るので、ほかのテストと並べると
 * 互いの待ち時間を超える（Issue #173）。印を付けたテストは chrome-machine で 1 件ずつ走らせる（pnpm run test:e2e は、ほかのテストのあとに走らせる）
 */
export const MACHINE_TAG = '@machine';
const machine = new RegExp(MACHINE_TAG);

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
    ...BROWSERS.map((browser) => ({ ...browser, grepInvert: machine })),
    { name: 'chrome-machine', use: { channel: 'chrome' }, grep: machine, workers: 1 },
    {
      name: 'chrome-quiet',
      use: { channel: 'chrome', contextOptions: { reducedMotion: 'reduce' } },
      testMatch: ['missions/idor/__tests__/idor.spec.ts', 'missions/stored-xss/__tests__/stored-xss.spec.ts', 'missions/sqli/__tests__/sqli.spec.ts', 'missions/onboarding/__tests__/onboarding.spec.ts'],
    },
  ],
  // 配布物と同じく、ビルド成果物をlocalhost限定の静的サーバで配信する
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${port}/`,
    // 起動中のサーバは使い回さない。同じポートで別のビルドを配信しているサーバを、気づかずに試すことがないようにする
    reuseExistingServer: false,
  },
});
