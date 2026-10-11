// PoC: Worker上のSQLite WASM（Issue #2）。結果は docs/poc/sqlite-wasm.md に記録する。
import { openMemoryDatabase, type Database } from '../../runtimes/browser/sqlite';

export type PocRequest =
  | { op: 'init' }
  | { op: 'search'; mode: 'param' | 'concat'; ownerId: number; q: string }
  | { op: 'insert'; ownerId: number; title: string }
  | { op: 'count' }
  | { op: 'busy' };

let db: Database | undefined;

const SEED = `
  CREATE TABLE memos (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, title TEXT NOT NULL);
  INSERT INTO memos (owner_id, title) VALUES
    (1, '買い物メモ'), (1, '会議メモ'), (1, 'O''Reilly の本'),
    (2, '非公開の日記'), (2, '社外秘メモ');
`;

async function handle(req: PocRequest): Promise<unknown> {
  if (req.op === 'init') {
    const started = performance.now();
    db = await openMemoryDatabase();
    db.exec(SEED);
    return { initMs: performance.now() - started };
  }
  if (!db) throw new Error('未初期化');
  switch (req.op) {
    case 'search': {
      // 実行したクエリ形・バインド値・返却行の所有者を観測できるかを確かめる（spec §8.3）
      const { sql, bind } =
        req.mode === 'param'
          ? { sql: 'SELECT id, owner_id, title FROM memos WHERE owner_id = ? AND title LIKE ?', bind: [req.ownerId, `%${req.q}%`] }
          : { sql: `SELECT id, owner_id, title FROM memos WHERE owner_id = ${req.ownerId} AND title LIKE '%${req.q}%'`, bind: [] };
      const rows = db.selectObjects(sql, bind);
      return { sql, bind, rows, owners: [...new Set(rows.map((r) => r.owner_id))] };
    }
    case 'insert':
      db.exec({ sql: 'INSERT INTO memos (owner_id, title) VALUES (?, ?)', bind: [req.ownerId, req.title] });
      return null;
    case 'count':
      return db.selectValue('SELECT count(*) FROM memos');
    case 'busy':
      // 終わらないクエリ。Worker を外から停止できることを確かめる
      return db.selectValue('WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c');
  }
}

self.addEventListener('message', async (e: MessageEvent<{ id: number; req: PocRequest }>) => {
  const { id, req } = e.data;
  try {
    self.postMessage({ id, ok: true, result: await handle(req) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
});
