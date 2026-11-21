// tar の中身を読み、Linux の initramfs の形式（cpio newc）へ詰め直す。所有者・許可（setuid を含む）をそのまま運ぶため、
// ファイルシステムへ展開せずにメモリの中で変換する（展開すると、root でない利用者では所有者と setuid が失われる）

/**
 * アーカイブの 1 項目。data は通常ファイルの中身、target はシンボリックリンクの指す先
 * @typedef {{ path: string, type: 'file' | 'dir' | 'symlink', mode: number, uid?: number, gid?: number, mtime?: number, data?: Buffer, target?: string }} Entry
 */

const BLOCK = 512;
/**
 * tar の種類（typeflag）と、項目の種類
 * @type {Record<string, Entry['type']>}
 */
const KINDS = { 0: 'file', '\0': 'file', 5: 'dir', 2: 'symlink' };
/** cpio の mode に入れる、ファイルの種類 */
const TYPE_BITS = { file: 0o100000, dir: 0o040000, symlink: 0o120000 };

/** @type {(block: Buffer, from: number, length: number) => string} */
const text = (block, from, length) => {
  const field = block.subarray(from, from + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? length : end).toString('utf8');
};
/** @type {(block: Buffer, from: number, length: number) => number} */
const octal = (block, from, length) => Number.parseInt(text(block, from, length).trim() || '0', 8);

/**
 * pax の拡張ヘッダー（"長さ キー=値\n" の並び）を読む。次の項目の path と linkpath が入っている
 * @param {Buffer} data
 * @returns {Record<string, string>}
 */
function paxRecords(data) {
  /** @type {Record<string, string>} */
  const records = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    const length = Number(data.subarray(at, space).toString('ascii'));
    const [key = '', ...value] = data.subarray(space + 1, at + length - 1).toString('utf8').split('=');
    records[key] = value.join('=');
    at += length;
  }
  return records;
}

/**
 * ヘッダーと中身から、項目を作る。扱うのは通常ファイル・ディレクトリ・シンボリックリンクで、ほかの種類があれば止める
 * @param {Buffer} header
 * @param {Buffer} data
 * @param {Record<string, string>} pax 直前の pax ヘッダーの値
 * @returns {Entry}
 */
function tarEntry(header, data, pax) {
  const flag = String.fromCharCode(header[156] ?? 0);
  const prefix = text(header, 345, 155);
  const name = pax.path ?? (prefix ? `${prefix}/` : '') + text(header, 0, 100);
  const path = name.replace(/^\.\//, '').replace(/\/$/, '');
  const type = KINDS[flag];
  if (!type) throw new Error(`tar の項目 ${path} の種類（${flag}）は扱えません`);
  /** @type {Entry} */
  const entry = { path, type, mode: octal(header, 100, 8) & 0o7777, uid: octal(header, 108, 8), gid: octal(header, 116, 8), mtime: octal(header, 136, 12) };
  if (type === 'file') entry.data = data;
  if (type === 'symlink') entry.target = pax.linkpath ?? text(header, 157, 100);
  return entry;
}

/**
 * tar（展開済み）の項目を順に返す
 * @param {Buffer} tar
 * @returns {Entry[]}
 */
export function readTar(tar) {
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Record<string, string>} */
  let pax = {};
  let at = 0;
  while (at + BLOCK <= tar.length) {
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    const data = tar.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    const flag = String.fromCharCode(header[156] ?? 0);
    if (flag === 'x') pax = paxRecords(data);
    // 全体に掛かる pax ヘッダー（g）は、パスを変えないので読み飛ばす
    if (flag === 'x' || flag === 'g') continue;
    const entry = tarEntry(header, data, pax);
    pax = {};
    if (entry.path !== '' && entry.path !== '.') entries.push(entry);
  }
  return entries;
}

/** @type {(length: number) => Buffer} */
const pad4 = (length) => Buffer.alloc((4 - (length % 4)) % 4);

/**
 * @param {number} ino
 * @param {Pick<Entry, 'path' | 'mode' | 'uid' | 'gid' | 'mtime'>} entry mode は、ファイルの種類を含めた値
 * @param {Buffer} body
 * @returns {Buffer[]}
 */
function cpioEntry(ino, { path, mode, uid = 0, gid = 0, mtime = 0 }, body) {
  const name = Buffer.from(`${path}\0`, 'utf8');
  const fields = [ino, mode, uid, gid, 1, mtime, body.length, 0, 0, 0, 0, name.length, 0];
  const header = Buffer.from(`070701${fields.map((field) => field.toString(16).padStart(8, '0')).join('')}`, 'ascii');
  return [header, name, pad4(header.length + name.length), body, pad4(body.length)];
}

/**
 * 項目を cpio（newc）にまとめる。同じパスが 2 回あれば、あとのものが上書きする（カーネルが順に展開するため）
 * @param {Entry[]} entries
 * @returns {Buffer}
 */
export function cpioArchive(entries) {
  const parts = entries.flatMap((entry, index) => {
    const body = entry.type === 'symlink' ? Buffer.from(entry.target ?? '', 'utf8') : (entry.data ?? Buffer.alloc(0));
    return cpioEntry(index + 1, { ...entry, mode: entry.mode | TYPE_BITS[entry.type] }, body);
  });
  return Buffer.concat([...parts, ...cpioEntry(0, { path: 'TRAILER!!!', mode: 0 }, Buffer.alloc(0))]);
}
