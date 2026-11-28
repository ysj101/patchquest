// Node のテストで、演習用の機械の配布物を .machine/ から読む。配布物は vitest の globalSetup（tests/support/machine-setup.ts）が用意する。
// 正規表現エンジン（PCRE2）の配布物は、リポジトリに入れてある vendor/pcre2/ から読む
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetLoader } from '../../runtimes/browser/machine';
import { REGEX_ASSET } from '../../runtimes/browser/regex';

export const readMachineAsset: AssetLoader = async (name) => {
  const bytes = await readFile(join(name === REGEX_ASSET ? 'vendor/pcre2' : '.machine', name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
