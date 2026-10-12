// 配布物を作り、標準の ZIP 展開（Python の zipfile）で展開して、localhost で開いて確かめる
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { packageRelease } from './package.mjs';
import { unpackDir, zipPath } from './release.mjs';

await packageRelease();
await rm(unpackDir, { recursive: true, force: true });
execFileSync('python3', ['-m', 'zipfile', '-e', zipPath, unpackDir], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.dist.config.ts', ...process.argv.slice(2)], { stdio: 'inherit' });
