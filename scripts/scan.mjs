// 検査スクリプトで共有する、ディレクトリ内のファイルの列挙
import { readdir } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

/** root 以下で、拡張子が extensions に含まれ、exclude のどれでも始まらないファイルのパス（OS によらず / 区切り） */
export async function listFiles(root, extensions, exclude = []) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && extensions.includes(extname(e.name)))
    .map((e) => join(e.parentPath, e.name).split(sep).join('/'))
    .filter((path) => !exclude.some((x) => path.startsWith(x)));
}
