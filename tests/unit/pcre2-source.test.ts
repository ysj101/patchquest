// リポジトリに入れてある正規表現エンジン PCRE2（vendor/pcre2/）が、記録したものと同じであること、配布物に添える表示がそろっていることを確かめる
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGEX_ASSET, RegexEngine } from '../../runtimes/browser/regex';
import { PCRE2_DIR, PCRE2_SOURCE, PCRE2_WASM, PCRE2_WASM_SHA256, pcre2LegalText } from '../../scripts/pcre2-source.mjs';
import { readMachineAsset } from '../support/machine-assets';

describe('同梱する PCRE2', () => {
  it('置いてある pcre2.wasm は、記録したハッシュと合う（断りなく差し替わっていない）', async () => {
    const wasm = await readFile(join(PCRE2_DIR, PCRE2_WASM));
    expect(createHash('sha256').update(wasm).digest('hex')).toBe(PCRE2_WASM_SHA256);
  });

  it('実行環境が読む名前と、ビルドが置く名前が同じ', () => {
    expect(PCRE2_WASM).toBe(REGEX_ASSET);
  });

  it('エンジンが答える版は、記録したソースの版と同じ', async () => {
    const regex = await RegexEngine.load(await readMachineAsset(REGEX_ASSET), 1000);
    expect(regex.version.split(' ')[0]).toBe(PCRE2_SOURCE.version);
  });

  it('配布物に添える表示は、版・ライセンス・ソースコードの入手先とハッシュ・ライセンスの全文を含む', async () => {
    const text = await pcre2LegalText();
    expect(text).toContain(`PCRE2 ${PCRE2_SOURCE.version} を WebAssembly にビルドしたもの`);
    expect(text).toContain('ライセンス：BSD-3-Clause WITH PCRE2-exception');
    expect(text).toContain(`ソースコード：${PCRE2_SOURCE.url}\n  SHA-256 ${PCRE2_SOURCE.sha256}`);
    expect(text).toContain('SPDX-License-Identifier: | BSD-3-Clause WITH PCRE2-exception');
    expect(text).toContain('Redistributions in binary form must reproduce the above copyright');
    expect(text).toContain('EXEMPTION FOR BINARY LIBRARY-LIKE PACKAGES');
  });
});
