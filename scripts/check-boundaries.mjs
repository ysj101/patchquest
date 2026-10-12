// 読み込みの向きを確かめる（spec §11.3）。課題は互いに依存せず、プラットフォームは個別の課題・教材アプリに依存しない。
// 課題とアプリを組み合わせるのはカタログ（catalog/。プラットフォームからは別名 @catalog）だけにする
import { readdir, readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './scan.mjs';

const ROOTS = ['platform', 'runtimes', 'apps', 'missions'];
const CATALOG_ALIAS = '@catalog';

/** import … from・export … from・import '…'・import('…') の読み込み先 */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/g;

/** 依存を区別する単位。教材アプリと課題はディレクトリごとに分ける */
function unitOf(path) {
  const [top, name] = path.split('/');
  return top === 'apps' || top === 'missions' ? `${top}/${name}` : top;
}

/** from（ファイル）から target（リポジトリ内のパス、または @catalog）を読み込んでよいか。だめなら理由を返す */
function ruleFor(from, target) {
  const self = unitOf(from);
  const [layer] = self.split('/');
  const to = target === CATALOG_ALIAS ? 'catalog' : unitOf(target);
  const [toLayer] = to.split('/');
  if (layer === 'platform' || layer === 'runtimes') {
    if (toLayer === 'missions' || toLayer === 'apps') return '個別の課題・教材アプリに直接依存しています（カタログを @catalog で読み込む）';
    if (toLayer === 'catalog' && target !== CATALOG_ALIAS) return 'カタログは @catalog で読み込みます（テスト用のカタログに差し替えるため）';
  }
  if (layer === 'apps') {
    if (toLayer === 'missions' || toLayer === 'catalog') return '教材アプリは課題・カタログに依存できません';
    if (toLayer === 'apps' && to !== self && to !== 'apps/shared') return '教材アプリは他のアプリに依存できません（共通の部品は apps/shared に置く）';
  }
  if (layer === 'missions') {
    if (toLayer === 'missions' && to !== self) return '課題は他の課題に依存できません';
    const contract = target === 'platform/contract' || target.startsWith('platform/contract/');
    if (toLayer === 'catalog' || toLayer === 'runtimes' || (toLayer === 'platform' && !contract)) {
      return '課題が読み込めるのは platform/contract と教材アプリだけです';
    }
  }
  return null;
}

const lineOf = (content, index) => content.slice(0, index).split('\n').length;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 依存の向きの違反と、コア（platform・runtimes・apps）に書かれた課題 ID を返す。
 * files のパスはリポジトリからの相対パス（/ 区切り）
 */
export function findBoundaryViolations(files, packIds) {
  const violations = [];
  const packLiteral = packIds.length ? new RegExp(`(['"\`])(${packIds.map(escapeRegExp).join('|')})\\1`, 'g') : null;
  for (const { path, content } of files) {
    for (const match of content.matchAll(SPECIFIER)) {
      const specifier = match[2];
      if (specifier !== CATALOG_ALIAS && !specifier.startsWith('.')) continue; // 外部パッケージ
      const target = specifier === CATALOG_ALIAS ? specifier : posix.normalize(posix.join(posix.dirname(path), specifier));
      const reason = ruleFor(path, target);
      if (reason) violations.push(`${path}:${lineOf(content, match.index)}: ${reason}（${specifier}）`);
    }
    if (packLiteral && !path.startsWith('missions/')) {
      for (const match of content.matchAll(packLiteral)) {
        violations.push(`${path}:${lineOf(content, match.index)}: 課題 ID「${match[2]}」を書いています（コアに課題ごとの分岐を入れない）`);
      }
    }
  }
  return violations;
}

/** リポジトリの課題 ID（missions/ のディレクトリ名） */
async function packIds() {
  return (await readdir('missions', { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function checkBoundaries() {
  const paths = (await Promise.all(ROOTS.map((root) => listFiles(root, ['.ts'])))).flat();
  const files = await Promise.all(paths.map(async (path) => ({ path: path.split('\\').join('/'), content: await readFile(path, 'utf8') })));
  return findBoundaryViolations(files, await packIds());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = await checkBoundaries();
  for (const v of violations) console.error(`依存の境界を越えています: ${v}`);
  if (violations.length > 0) process.exit(1);
  console.log('課題・教材アプリ・プラットフォームの依存の境界は守られています');
}
