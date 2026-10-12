import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createZip } from '../../scripts/zip.mjs';

describe('createZip', () => {
  it('標準の ZIP として展開でき、日本語のファイル名と内容を保つ', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pq-zip-')), 'test.zip');
    writeFileSync(path, createZip([
      { name: 'root/README.md', data: Buffer.from('# 説明\n') },
      { name: 'root/assets/データ.bin', data: Buffer.from([0, 1, 2, 255]) },
    ]));
    const script = 'import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"bad": z.testzip(), "names": z.namelist(), "readme": z.read("root/README.md").decode()}))';
    const result = JSON.parse(execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }));
    expect(result).toEqual({ bad: null, names: ['root/README.md', 'root/assets/データ.bin'], readme: '# 説明\n' });
  });

  it('同じ内容からは同じ ZIP ができる', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('a') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });
});
