// 静的配信用の成果物を dist/ に生成する。外部CDNや実行時ダウンロードは使わない（spec §12）。
// --test を付けると、E2E用の検証ページ（tests/pages/）を dist/test/ に追加する。配布物には含めない。
import { build } from 'esbuild';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { assertNoExternalRefs } from './check-external-refs.mjs';

const outdir = 'dist';
const testMode = process.argv.includes('--test');
const sqliteWasm = 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm';

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: 'linked',
  legalComments: 'linked',
  logLevel: 'warning',
};

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });

await build({
  ...common,
  entryPoints: { main: 'platform/main.ts', styles: 'platform/styles.css' },
  outdir: `${outdir}/assets`,
});
await cp('platform/index.html', `${outdir}/index.html`);

if (testMode) {
  // SQLite WASMは、それを読み込むWorkerと同じディレクトリから取得される
  const pages = 'tests/pages';
  const files = await readdir(pages);
  await build({
    ...common,
    entryPoints: files.filter((f) => f.endsWith('.ts')).map((f) => `${pages}/${f}`),
    outdir: `${outdir}/test`,
  });
  await Promise.all(files.filter((f) => f.endsWith('.html')).map((f) => cp(`${pages}/${f}`, `${outdir}/test/${f}`)));
  await cp(sqliteWasm, `${outdir}/test/sqlite3.wasm`);
}

await assertNoExternalRefs(outdir);
console.log(`ビルド完了: ${outdir}/${testMode ? '（検証ページを含む）' : ''}`);
