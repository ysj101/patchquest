// 社内ポータルのデータ。サインインしているかは、利用者の行に持つ（この実行方式では Cookie を使えないため）
export const SCHEMA = `
  CREATE TABLE users (
    key TEXT PRIMARY KEY,
    signed_in INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE notices (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
`;
