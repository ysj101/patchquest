// 掲示板のデータ。コメントと、掲示板のページの応答に付けるヘッダ（サーバの設定）
export const SCHEMA = `
CREATE TABLE comments (id INTEGER PRIMARY KEY, author TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE response_headers (name TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
