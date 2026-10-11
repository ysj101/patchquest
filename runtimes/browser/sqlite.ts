import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';

// WASMの読み込みは1実行環境につき1回にし、DBは演習ごとにメモリ上へ作り直す（spec §14）
let sqlite3: ReturnType<typeof sqlite3InitModule> | undefined;

export async function openMemoryDatabase(): Promise<Database> {
  sqlite3 ??= sqlite3InitModule();
  const { oo1 } = await sqlite3;
  return new oo1.DB(':memory:', 'c');
}

export type { Database };
