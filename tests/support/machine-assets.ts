// Node のテストで、演習用の機械の配布物を .machine/ から読む。配布物は vitest の globalSetup（tests/support/machine-setup.ts）が用意する
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetLoader } from '../../runtimes/browser/machine';

export const readMachineAsset: AssetLoader = async (name) => {
  const bytes = await readFile(join('.machine', name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
