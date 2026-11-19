// 擬似シェルが扱う機械の状態。利用者・ファイル・プログラムを SQLite に持ち、初期化・ハッシュ・リセットを既存の実行環境に任せる
export const SCHEMA = `
  CREATE TABLE machine (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE accounts (
    name TEXT PRIMARY KEY,
    -- 演習ハーネスの利用者キー。ログインできない利用者（root）は NULL
    actor TEXT UNIQUE,
    uid INTEGER NOT NULL UNIQUE,
    home TEXT NOT NULL
  );
  CREATE TABLE memberships (
    account TEXT NOT NULL REFERENCES accounts (name),
    grp TEXT NOT NULL,
    PRIMARY KEY (account, grp)
  );
  CREATE TABLE files (
    path TEXT PRIMARY KEY,
    parent TEXT REFERENCES files (path),
    kind TEXT NOT NULL CHECK (kind IN ('dir', 'file', 'program')),
    owner TEXT NOT NULL REFERENCES accounts (name),
    -- all: 誰でも読める / owner: 所有者と root だけが読める
    readable TEXT NOT NULL CHECK (readable IN ('all', 'owner')),
    content TEXT NOT NULL
  );
  CREATE TABLE programs (
    path TEXT PRIMARY KEY REFERENCES files (path),
    needs_root INTEGER NOT NULL,
    output TEXT NOT NULL
  );
`;
