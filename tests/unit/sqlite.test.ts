import { describe, expect, it } from 'vitest';
import { openMemoryDatabase } from '../../runtimes/browser/sqlite';

describe('openMemoryDatabase', () => {
  it('Node上でもメモリDBを開け、DBごとにデータが独立している', async () => {
    const a = await openMemoryDatabase();
    const b = await openMemoryDatabase();
    a.exec('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'a\')');
    expect(a.selectValue('SELECT v FROM t')).toBe('a');
    expect(() => b.selectValue('SELECT v FROM t')).toThrow(/no such table/);
    a.close();
    b.close();
  });
});
