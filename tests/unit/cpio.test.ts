// 演習用の機械のファイルシステムを組み立てる部品（tar を読み、initramfs の形式へ詰め直す）が、所有者・許可・長いパスを保つことを確かめる
import { describe, expect, it } from 'vitest';
import { cpioArchive, readTar } from '../../scripts/cpio.mjs';

const LONG_NAME = `${'深い場所/'.repeat(30)}ファイル.txt`;
const BLOCK = 512;

/** tar の 1 項目（ヘッダーと、512 バイト単位にそろえた中身） */
function tarItem(name: string, flag: string, mode: number, body = '', link = ''): Buffer {
  const data = Buffer.from(body);
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0);
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000001750\0', 136);
  header.write(flag, 156);
  header.write(link, 157);
  return Buffer.concat([header, data, Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK)]);
}

/** pax の拡張ヘッダーの 1 件（"長さ キー=値\n"。長さは自分自身を含む） */
function paxRecord(key: string, value: string): string {
  const rest = Buffer.byteLength(` ${key}=${value}\n`);
  let length = rest + 1;
  while (String(length).length + rest !== length) length = String(length).length + rest;
  return `${length} ${key}=${value}\n`;
}

/** setuid のファイル・ディレクトリ・シンボリックリンクと、pax ヘッダーで渡す長いパスを含む tar */
function sampleTar(): Buffer {
  return Buffer.concat([
    tarItem('./usr/bin/', '5', 0o755),
    tarItem('./usr/bin/sudo', '0', 0o4755, 'binary'),
    tarItem('./usr/bin/sudoedit', '2', 0o777, '', 'sudo'),
    tarItem('PaxHeader', 'x', 0o644, paxRecord('path', LONG_NAME)),
    tarItem('short', '0', 0o644, 'x'),
    Buffer.alloc(BLOCK * 2),
  ]);
}

describe('readTar', () => {
  it('ファイル・ディレクトリ・シンボリックリンクを、許可（setuid を含む）と所有者ごと読む', () => {
    const entries = readTar(sampleTar());
    expect(entries.map(({ path, type, mode, uid }) => ({ path, type, mode: mode.toString(8), uid }))).toEqual([
      { path: 'usr/bin', type: 'dir', mode: '755', uid: 0 },
      { path: 'usr/bin/sudo', type: 'file', mode: '4755', uid: 0 },
      { path: 'usr/bin/sudoedit', type: 'symlink', mode: '777', uid: 0 },
      { path: LONG_NAME, type: 'file', mode: '644', uid: 0 },
    ]);
    expect(entries[1]?.data?.toString()).toBe('binary');
    expect(entries[2]?.target).toBe('sudo');
  });

  it('扱えない種類の項目（ハードリンクなど）があれば、黙って落とさずに止める', () => {
    const tar = sampleTar();
    // 2 つめの項目（usr/bin/sudo）の種類を、ハードリンク（1）に書き換える
    tar[512 + 156] = '1'.charCodeAt(0);
    expect(() => readTar(tar)).toThrow('種類（1）は扱えません');
  });
});

describe('cpioArchive', () => {
  it('項目を newc 形式で並べ、種類と許可を mode に入れ、最後に終わりの印を置く', () => {
    const archive = cpioArchive(readTar(sampleTar())).toString('latin1');
    const headers = [...archive.matchAll(/070701([0-9a-f]{104})/g)].map((match) => {
      const fields = match[0].slice(6).match(/.{8}/g) ?? [];
      const nameSize = Number.parseInt(fields[11] ?? '', 16);
      const name = Buffer.from(archive.slice(match.index + 110, match.index + 110 + nameSize - 1), 'latin1').toString('utf8');
      return { name, mode: Number.parseInt(fields[1] ?? '', 16).toString(8), size: Number.parseInt(fields[6] ?? '', 16) };
    });
    expect(headers).toEqual([
      { name: 'usr/bin', mode: '40755', size: 0 },
      { name: 'usr/bin/sudo', mode: '104755', size: 6 },
      { name: 'usr/bin/sudoedit', mode: '120777', size: 4 },
      { name: LONG_NAME, mode: '100644', size: 1 },
      { name: 'TRAILER!!!', mode: '0', size: 0 },
    ]);
    expect(archive.length % 4).toBe(0);
  });
});
