// ローカル配布物（ZIP）を作る（spec §12）。配布用のビルド（検証ページを含まない）と、起動手順の README を同梱する
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseName, zipPath } from './release.mjs';
import { listFiles } from './scan.mjs';
import { createZip } from './zip.mjs';

export async function packageRelease() {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  // ソースマップは開発用のため同梱しない
  const files = (await listFiles('dist', ['.html', '.js', '.css', '.wasm', '.txt'])).sort();
  // ZIP の名前の区切りは常に /（Windows でも）
  const entries = [
    { name: `${releaseName}/README.md`, data: await readFile('docs/local-readme.md') },
    ...(await Promise.all(files.map(async (path) => ({ name: `${releaseName}/${relative('dist', path).split(sep).join('/')}`, data: await readFile(path) })))),
  ];
  await mkdir('release', { recursive: true });
  await writeFile(zipPath, createZip(entries));
  console.log(`配布物を作りました: ${zipPath}（${entries.length} ファイル）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await packageRelease();
