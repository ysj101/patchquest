// 掲示板のデータの読み書き
import type { Database } from '../../runtimes/browser/sqlite';

export interface Comment {
  id: number;
  author: string;
  body: string;
}

/** サーバの設定で決められる応答ヘッダの値の長さの上限 */
export const HEADER_VALUE_MAX_LENGTH = 300;

export function listComments(db: Database): Comment[] {
  return db.selectObjects('SELECT id, author, body FROM comments ORDER BY id') as unknown as Comment[];
}

/** 掲示板のページの応答に付けるヘッダ（名前は小文字） */
export function responseHeaders(db: Database): Record<string, string> {
  const rows = db.selectObjects('SELECT name, value FROM response_headers ORDER BY name') as unknown as { name: string; value: string }[];
  return Object.fromEntries(rows.map(({ name, value }) => [name, value]));
}

/** ヘッダの値を決める。空なら、そのヘッダを付けない */
export function setResponseHeader(db: Database, name: string, value: string): void {
  db.exec({ sql: 'DELETE FROM response_headers WHERE name = ?', bind: [name] });
  if (value !== '') db.exec({ sql: 'INSERT INTO response_headers (name, value) VALUES (?, ?)', bind: [name, value] });
}
