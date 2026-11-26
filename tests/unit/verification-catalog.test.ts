// 出荷前検証の対象（tests/support/verification-catalog.ts）が、同梱のすべてのパックと基準のテスト専用パックを漏れなく 1 回ずつ含むこと
import { describe, expect, it } from 'vitest';
import { catalog as bundled } from '../../catalog';
import { verificationCatalog } from '../support/verification-catalog';

describe('出荷前検証の対象', () => {
  it('同梱のすべてのパックと、テスト専用の基準パックを、重複なく含む', () => {
    const ids = verificationCatalog.packs.map((pack) => pack.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(bundled.packs.map((pack) => pack.manifest.id)));
    expect(ids).toEqual(expect.arrayContaining(['test-pack', 'shell-test-pack']));
  });
});
