// pre-commit で走らせるテストの選び方（scripts/test-related.mjs）。import をたどれない変更は全件に戻し、削除したファイルは vitest に渡さない
import { describe, expect, it } from 'vitest';
import { selectTests } from '../../scripts/test-related.mjs';

const everything = () => true;

describe('pre-commit で走らせるテストの選び方', () => {
  it.each([
    'vitest.config.ts',
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tests/support/catalog.ts',
    'scripts/build-machine.mjs',
    'apps/shell/linux/guest/init.sh',
    'scripts/machine-licenses/GPL-2.0.txt',
  ])('%s が変わったら全件を走らせる', (path) => {
    expect(selectTests(['platform/a.ts', path], everything)).toEqual({ all: true });
  });

  it('ふつうのファイルは、そのファイルだけを vitest に渡す', () => {
    expect(selectTests(['platform/a.ts', '日本語 と 空白.ts'], everything)).toEqual({ all: false, files: ['platform/a.ts', '日本語 と 空白.ts'] });
  });

  it('削除したファイルは渡さない', () => {
    expect(selectTests(['platform/a.ts', 'platform/gone.ts'], (path) => path === 'platform/a.ts')).toEqual({ all: false, files: ['platform/a.ts'] });
  });

  it('import されないがテストが読むファイルが変わったら、そのテストも走らせる', () => {
    expect(selectTests(['platform/ui/gone.ts'], () => false)).toEqual({ all: false, files: ['tests/unit/catalog.test.ts'] });
    expect(selectTests(['docs/formal/Popover.tla'], everything)).toEqual({ all: false, files: ['docs/formal/Popover.tla', 'tests/unit/formal-models.test.ts'] });
  });

  it('変更がなければ、走らせるテストはない', () => {
    expect(selectTests([], everything)).toEqual({ all: false, files: [] });
  });
});
