// 静的配信用の成果物を dist/ に生成する。外部CDNや実行時ダウンロードは使わない（spec §12）。
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { checkDirectory } from './check-external-refs.mjs';

const outdir = 'dist';

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });

await build({
  entryPoints: { main: 'platform/main.ts', styles: 'platform/styles.css' },
  outdir: `${outdir}/assets`,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: 'linked',
  legalComments: 'linked',
  logLevel: 'warning',
});

await cp('platform/index.html', `${outdir}/index.html`);

const violations = await checkDirectory(outdir);
if (violations.length > 0) {
  for (const v of violations) console.error(`外部参照: ${v.path}: ${v.match}`);
  process.exit(1);
}
console.log(`ビルド完了: ${outdir}/`);
