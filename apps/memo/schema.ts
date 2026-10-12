export const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
  CREATE TABLE memos (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users (id),
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE pages (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
  CREATE TABLE comments (
    id INTEGER PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages (id),
    author_id INTEGER NOT NULL REFERENCES users (id),
    body TEXT NOT NULL
  );
`;
