// 配布物の名前と置き場所。作成（package.mjs）と確認（test-dist.mjs・playwright.dist.config.ts）で共有する
import { readFileSync } from 'node:fs';

export const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
export const releaseName = `patchquest-${version}`;
export const zipPath = `release/${releaseName}.zip`;
/** 確認のために ZIP を展開する場所。展開すると releaseName のフォルダができる */
export const unpackDir = 'release/unpacked';
