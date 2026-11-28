// 正規表現エンジン PCRE2 を、公式のソースから WebAssembly にビルドして vendor/pcre2/pcre2.wasm に置く。
// 出来上がりはリポジトリに入れてあるので、ふだんのビルド（scripts/build.mjs）とテストはこれを実行しない。
// PCRE2 の版を上げる・入口（scripts/pcre2/）を変えるときにだけ実行する。手順は docs/pcre2-wasm.md。
// 要るもの：wasm32 向けに出力できる clang と、WebAssembly のリンカ（wasm-ld）。場所は環境変数 PQ_CLANG・PQ_WASM_LD で指定する
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readTar } from './cpio.mjs';
import { PCRE2_DIR, PCRE2_LICENCE, PCRE2_SOURCE, PCRE2_WASM } from './pcre2-source.mjs';

const WORK_DIR = '.pcre2';
const SHIM_DIR = 'scripts/pcre2';
/** 8 ビットのライブラリを作るソース（PCRE2 の NON-AUTOTOOLS-BUILD の一覧と同じ） */
const MODULES = [
  'auto_possess',
  'chkdint',
  'chartables',
  'compile',
  'compile_cgroup',
  'compile_class',
  'config',
  'context',
  'convert',
  'dfa_match',
  'error',
  'extuni',
  'find_bracket',
  'jit_compile',
  'maketables',
  'match',
  'match_data',
  'match_next',
  'newline',
  'ord2utf',
  'pattern_info',
  'script_run',
  'serialize',
  'string_utils',
  'study',
  'substitute',
  'substring',
  'tables',
  'ucd',
  'valid_utf',
  'xclass',
];
/**
 * そのままの名前では使えないファイル。配布物の中の名前 → ビルドで使う名前（NON-AUTOTOOLS-BUILD の手順 1〜3）
 * @type {Record<string, string | undefined>}
 */
const RENAMED = { 'config.h.generic': 'config.h', 'pcre2.h.generic': 'pcre2.h', 'pcre2_chartables.c.dist': 'pcre2_chartables.c' };

/** @type {(data: Buffer) => string} */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** @returns {Promise<Buffer>} */
async function fetchTarball() {
  const cached = join(WORK_DIR, PCRE2_SOURCE.file);
  const kept = await readFile(cached).catch(() => null);
  if (kept && sha256(kept) === PCRE2_SOURCE.sha256) return kept;
  const response = await fetch(PCRE2_SOURCE.url);
  if (!response.ok) throw new Error(`${PCRE2_SOURCE.url} を取得できません（${response.status}）`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== PCRE2_SOURCE.sha256) throw new Error(`${PCRE2_SOURCE.url} の中身が、固定したハッシュと合いません`);
  await mkdir(WORK_DIR, { recursive: true });
  await writeFile(cached, data);
  return data;
}

/**
 * ソースの src/ と、ライセンス文を取り出す
 * @param {Buffer} tarball
 * @param {string} srcDir
 * @returns {Promise<Buffer>} ライセンス文（LICENCE.md）
 */
async function unpack(tarball, srcDir) {
  const root = `pcre2-${PCRE2_SOURCE.version}`;
  const entries = readTar(gunzipSync(tarball));
  await mkdir(srcDir, { recursive: true });
  for (const entry of entries) {
    const match = new RegExp(`^${root}/src/([^/]+)$`).exec(entry.path);
    if (!match?.[1] || !entry.data) continue;
    const name = match[1];
    await writeFile(join(srcDir, RENAMED[name] ?? name), entry.data);
  }
  const licence = entries.find((entry) => entry.path === `${root}/LICENCE.md`)?.data;
  if (!licence) throw new Error('PCRE2 のソースに LICENCE.md がありません');
  return licence;
}

/**
 * ビルドに使う道具の場所。PATH からは探さず、環境変数で場所を指定する（どの道具で作ったかを、作る人が決める）
 * @param {string} name
 * @returns {string}
 */
function tool(name) {
  const path = process.env[name];
  if (!path) throw new Error(`${name} に、道具の場所を指定してください（docs/pcre2-wasm.md）`);
  return path;
}

/** @type {(command: string, args: string[]) => void} */
const run = (command, args) => void execFileSync(command, args, { stdio: 'inherit' });

async function buildPcre2() {
  const srcDir = join(WORK_DIR, 'src');
  const objDir = join(WORK_DIR, 'obj');
  await rm(srcDir, { recursive: true, force: true });
  await rm(objDir, { recursive: true, force: true });
  await mkdir(objDir, { recursive: true });
  const licence = await unpack(await fetchTarball(), srcDir);

  const clang = tool('PQ_CLANG');
  // Unicode の表（SUPPORT_UNICODE）と JIT は入れない。libc を持ち込まず、外の関数（import）を 1 つも要らないモジュールにする
  const flags = [
    '--target=wasm32',
    '-Oz',
    '-ffreestanding',
    '-nostdlib',
    '-fno-builtin',
    '-fvisibility=hidden',
    '-isystem',
    join(SHIM_DIR, 'include'),
    `-I${srcDir}`,
    '-DHAVE_CONFIG_H',
    '-DPCRE2_CODE_UNIT_WIDTH=8',
    '-DSUPPORT_PCRE2_8=1',
    '-DPCRE2_STATIC=1',
    '-DNDEBUG',
  ];
  const sources = [...MODULES.map((name) => join(srcDir, `pcre2_${name}.c`)), join(SHIM_DIR, 'libc.c'), join(SHIM_DIR, 'wrapper.c')];
  const objects = sources.map((source, index) => join(objDir, `${index}.o`));
  sources.forEach((source, index) => run(clang, [...flags, '-c', source, '-o', /** @type {string} */ (objects[index])]));

  const out = join(PCRE2_DIR, PCRE2_WASM);
  await mkdir(dirname(out), { recursive: true });
  // スタックをメモリの先頭に置く（あふれたら、ほかのデータを壊さずに止まる）
  run(tool('PQ_WASM_LD'), ['--no-entry', '--strip-all', '--gc-sections', '--stack-first', '-z', 'stack-size=1048576', '-o', out, ...objects]);
  // リンカは実行できるファイルとして書き出すが、これは読み込むだけのデータ
  await chmod(out, 0o644);
  await writeFile(join(PCRE2_DIR, PCRE2_LICENCE), licence);
  const wasm = await readFile(out);
  console.log(`${out}: ${wasm.length} バイト sha256 ${sha256(wasm)}（scripts/pcre2-source.mjs の PCRE2_WASM_SHA256 を、この値に合わせる）`);
}

await buildPcre2();
