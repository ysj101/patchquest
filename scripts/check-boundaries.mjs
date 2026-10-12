// 読み込みの向きを確かめる（spec §11.3）。課題は互いに依存せず、プラットフォームは個別の課題・教材アプリに依存しない。
// 課題とアプリを組み合わせるのはカタログ（catalog/。プラットフォームからは別名 @catalog）だけにする
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './scan.mjs';

/**
 * 層ごとに読み込んでよい先。ここにない先は読み込めない。self は同じ単位（同じアプリ・同じ課題）。
 * 外部パッケージはどこからでも読み込める
 */
const ALLOWED = {
  platform: ['platform', 'runtimes', '@catalog'],
  runtimes: ['runtimes', 'platform/contract', '@catalog'],
  apps: ['self', 'apps/shared', 'platform/contract', 'runtimes'],
  missions: ['self', 'platform/contract', 'apps'],
};
const ROOTS = Object.keys(ALLOWED);

/** import … from・export … from・import '…'・import('…') の読み込み先 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;

/** 課題 ID で分岐するコード（manifest.id・missionId・packId を文字列と比べる、または switch する） */
const PACK_ID = String.raw`[\w.]*\b(?:manifest\.id|missionId|packId)\b`;
const PACK_BRANCH = new RegExp(
  String.raw`${PACK_ID}\s*[!=]==?\s*['"\x60]|['"\x60]\s*[!=]==?\s*${PACK_ID}|\bswitch\s*\(\s*${PACK_ID}\s*\)`,
  'g',
);

/** 依存を区別する単位。教材アプリと課題はディレクトリごとに分ける */
function unitOf(path) {
  const [top, name] = path.split('/');
  return top === 'apps' || top === 'missions' ? `${top}/${name}` : top;
}

const allows = (entry, from, target) => (entry === 'self' ? unitOf(target) === unitOf(from) : target === entry || target.startsWith(`${entry}/`));
const lineOf = (content, index) => content.slice(0, index).split('\n').length;

/**
 * 依存の向きの違反と、プラットフォーム・実行環境にある課題 ID での分岐を返す。
 * files のパスはリポジトリからの相対パス（/ 区切り）、aliases は別名（tsconfig の paths）
 */
export function findBoundaryViolations(files, aliases) {
  const violations = [];
  for (const { path, content } of files) {
    const layer = path.split('/')[0];
    const allowed = ALLOWED[layer] ?? [];
    for (const match of content.matchAll(SPECIFIER)) {
      const specifier = match[2];
      const relative = specifier.startsWith('.');
      if (!relative && !aliases.includes(specifier)) continue; // 外部パッケージ
      const target = relative ? posix.normalize(posix.join(posix.dirname(path), specifier)) : specifier;
      if (!allowed.some((entry) => allows(entry, path, target))) {
        const list = allowed.map((entry) => (entry === 'self' ? '自分のディレクトリ' : entry)).join('・');
        violations.push(`${path}:${lineOf(content, match.index)}: ${specifier} は読み込めません（${layer} から読み込めるのは ${list}）`);
      }
    }
    if (layer === 'platform' || layer === 'runtimes') {
      for (const match of content.matchAll(PACK_BRANCH)) {
        violations.push(`${path}:${lineOf(content, match.index)}: 課題 ID で分岐しています（コアに課題ごとの分岐を入れない）: ${match[0]}`);
      }
    }
  }
  return violations;
}

export async function checkBoundaries() {
  const paths = (await Promise.all(ROOTS.map((root) => listFiles(root, ['.ts'])))).flat();
  const files = await Promise.all(paths.map(async (path) => ({ path, content: await readFile(path, 'utf8') })));
  const aliases = Object.keys(JSON.parse(await readFile('tsconfig.json', 'utf8')).compilerOptions.paths ?? {});
  return findBoundaryViolations(files, aliases);
}

/** 違反があれば一覧を出して終了する。ビルドからも呼ぶ */
export async function assertBoundaries() {
  const violations = await checkBoundaries();
  for (const v of violations) console.error(`依存の境界を越えています: ${v}`);
  if (violations.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertBoundaries();
  console.log('課題・教材アプリ・プラットフォームの依存の境界は守られています');
}
