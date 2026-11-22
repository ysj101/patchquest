// 静的配信用の成果物を dist/ に生成する。外部CDNや実行時ダウンロードは使わない（spec §12）。
// --test を付けると、カタログをテスト専用のもの（tests/support/catalog.ts）に差し替え、
// E2E用の検証ページ（tests/pages/）を dist/test/ に追加する。配布物には含めない。
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assertNoExternalRefs } from './check-external-refs.mjs';
import { assertBoundaries } from './check-boundaries.mjs';
import { assertDomSafety } from './check-dom-safety.mjs';
import { MACHINE_DIR, MACHINE_FILES, ensureMachine } from './build-machine.mjs';
import { machineLegalText } from './machine-licenses.mjs';

const outdir = 'dist';
const testMode = process.argv.includes('--test');
const sqliteWasm = 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm';

const common = {
  alias: { '@catalog': resolve(testMode ? 'tests/support/catalog.ts' : 'catalog/index.ts') },
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: 'linked',
  legalComments: 'linked',
  logLevel: 'warning',
  // エミュレータ（v86）は Node でも動くよう Node の組み込みモジュールを参照するが、ブラウザでは通らない分岐にある
  external: ['crypto', 'fs', 'perf_hooks', 'node:crypto', 'node:fs/promises'],
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

await assertDomSafety();
await assertBoundaries();
// 演習用の機械（本物の Linux）の配布物。元になるものが変わっていなければ作り直さない
await ensureMachine();

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });

const tasks = [
  build({
    ...common,
    entryPoints: { main: 'platform/main.ts', styles: 'platform/styles.css', 'runtime-worker': 'runtimes/browser/worker.ts' },
    outdir: `${outdir}/assets`,
  }),
  buildSandboxDocument('runtimes/browser/preview/preview.sandbox.html', `${outdir}/assets/preview.html`),
  cp('platform/ui/avatars', `${outdir}/assets/avatars`, { recursive: true }),
  cp('platform/ui/brand', `${outdir}/assets/brand`, { recursive: true }),
  cp('platform/index.html', `${outdir}/index.html`),
  // SQLite WASMは、それを読み込むWorkerと同じディレクトリから取得される
  cp(sqliteWasm, `${outdir}/assets/sqlite3.wasm`),
  // 演習用の機械の配布物も、Worker と同じディレクトリから取得される
  ...MACHINE_FILES.map((file) => cp(join(MACHINE_DIR, file), `${outdir}/assets/${file}`)),
  // 機械に入っているソフトウェアの一覧・ソースコードの入手先・ライセンスの全文
  machineLegalText().then((text) => writeFile(`${outdir}/assets/linux-machine.LEGAL.txt`, text)),
];

if (testMode) {
  const pages = 'tests/pages';
  const files = await readdir(pages);
  await mkdir(`${outdir}/test`, { recursive: true });
  tasks.push(
    build({
      ...common,
      entryPoints: files.filter((f) => f.endsWith('.ts')).map((f) => `${pages}/${f}`),
      outdir: `${outdir}/test`,
    }),
    ...files.filter((f) => f.endsWith('.html')).map((f) => cp(`${pages}/${f}`, `${outdir}/test/${f}`)),
  );
}

await Promise.all(tasks);
await assertNoExternalRefs(outdir);
console.log(`ビルド完了: ${outdir}/${testMode ? '（検証ページを含む）' : ''}`);
