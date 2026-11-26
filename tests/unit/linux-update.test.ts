// 更新の取り込みを持つ機械（apps/shell/linux/update.ts）の、一覧に書くハッシュが、置く更新の中身と合っていることを確かめる。
// 機械の中での取り込みと、sha256sum -c での中身の確認は、課題パックの出荷前検証（tests/unit/pack-verification.test.ts）が確かめる
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { UPDATE_BODY, UPDATE_SHA256 } from '../../apps/shell/linux/update';

it('一覧のハッシュは、機械に置く更新（末尾に改行が 1 つ付く）の SHA-256 と同じ', () => {
  expect(UPDATE_SHA256).toBe(createHash('sha256').update(`${UPDATE_BODY}\n`).digest('hex'));
});
