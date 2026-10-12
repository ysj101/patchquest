// ローカル配布物（ZIP）を作る（spec §12）。配布用のビルド（検証ページを含まない）と、起動手順の README を同梱する
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { listFiles } from './scan.mjs';
import { createZip } from './zip.mjs';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const root = `patchquest-${version}`;

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });

const files = (await listFiles('dist', ['.html', '.js', '.css', '.wasm', '.txt', '.map'])).sort();
const entries = [
  { name: `${root}/README.md`, data: await readFile('docs/local-readme.md') },
  ...(await Promise.all(files.map(async (path) => ({ name: `${root}/${relative('dist', path)}`, data: await readFile(path) })))),
];
await mkdir('release', { recursive: true });
const out = `release/${root}.zip`;
await writeFile(out, createZip(entries));
console.log(`配布物を作りました: ${out}（${entries.length} ファイル）`);
