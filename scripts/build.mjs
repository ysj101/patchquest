// 静的配信用の成果物を dist/ に生成する。外部CDNや実行時ダウンロードは使わない（spec §12）。
// --test を付けると、E2E用の検証ページ（tests/pages/）を dist/test/ に追加する。配布物には含めない。
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

const sha256 = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

// 同じスクリプトを複数の文書へインライン化するときは1回だけビルドする
const inlineScripts = new Map();

function buildInlineScript(entry) {
  if (!inlineScripts.has(entry)) {
    const bundled = build({ ...common, entryPoints: [entry], format: 'iife', write: false, sourcemap: false, legalComments: 'eof' });
    inlineScripts.set(entry, bundled.then(({ outputFiles }) => outputFiles[0].text.replaceAll('</script', '<\\/script')));
  }
  return inlineScripts.get(entry);
}

/**
 * 隔離iframe用の文書を作る。sandboxで不透明なoriginになるため、スクリプトは
 * <!--inline-script:相対パス--> の位置へクラシックスクリプトとしてインライン化し、
 * {{SCRIPT_HASH}} をそのハッシュに、{{sha256:テキスト}} をテキストのハッシュに置き換える。
 */
async function buildSandboxDocument(template, out) {
  const source = await readFile(template, 'utf8');
  const marker = source.match(/<!--inline-script:(\S+)-->/);
  if (!marker) throw new Error(`${template}: <!--inline-script:...--> がありません`);
  const script = await buildInlineScript(join(dirname(template), marker[1]));
  const html = source
    .replace(/\{\{sha256:(.+?)\}\}/g, (_, text) => sha256(text))
    .replaceAll('{{SCRIPT_HASH}}', sha256(script))
    .replace(marker[0], () => `<script>${script}</script>`);
  await writeFile(out, html);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });

const tasks = [
  build({ ...common, entryPoints: { main: 'platform/main.ts', styles: 'platform/styles.css' }, outdir: `${outdir}/assets` }),
  cp('platform/index.html', `${outdir}/index.html`),
];

if (testMode) {
  // SQLite WASMは、それを読み込むWorkerと同じディレクトリから取得される
  const pages = 'tests/pages';
  const files = await readdir(pages);
  await mkdir(`${outdir}/test`, { recursive: true });
  tasks.push(
    build({
      ...common,
      entryPoints: files.filter((f) => f.endsWith('.ts') && !f.endsWith('.inline.ts')).map((f) => `${pages}/${f}`),
      outdir: `${outdir}/test`,
    }),
    ...files
      .filter((f) => f.endsWith('.sandbox.html'))
      .map((f) => buildSandboxDocument(`${pages}/${f}`, `${outdir}/test/${f.replace('.sandbox.html', '.html')}`)),
    ...files
      .filter((f) => f.endsWith('.html') && !f.endsWith('.sandbox.html'))
      .map((f) => cp(`${pages}/${f}`, `${outdir}/test/${f}`)),
    cp(sqliteWasm, `${outdir}/test/sqlite3.wasm`),
  );
}

await Promise.all(tasks);
await assertNoExternalRefs(outdir);
console.log(`ビルド完了: ${outdir}/${testMode ? '（検証ページを含む）' : ''}`);
