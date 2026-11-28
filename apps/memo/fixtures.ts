// 架空の初期データ。seed から利用者の ID、メモの ID・内容を決める（spec §5.4）。利用者の表示名はキー（alice など）と同じ
import type { JsonPrimitive } from '../../platform/contract';
import type { FixtureGenerator } from '../../runtimes/browser/app-module';
import { random } from '../shared/random';
import { TOKEN_HEADER, composeToken, toBase64Url } from './jwt';

const SECRETS = ['合言葉は「ひまわり」', '金庫の番号は 4821', '旅行の行き先は 小樽', '誕生日の贈り物は 万年筆'];
const TOPICS = [
  ['買い物リスト', '牛乳、卵、食パン'],
  ['会議メモ', '次回は資料を事前に共有する'],
  ['読書記録', '第3章まで読んだ'],
  ['旅行の計画', '宿は駅の近くにする'],
  ['料理のレシピ', '玉ねぎは弱火で炒める'],
];

export const USERS = ['alice', 'bob', 'carol'] as const;

/** 乱数の列を、メモなどの初期データと分けるための値。鍵を足しても、ほかの初期データ（ID・内容）が変わらないようにする */
const TOKEN_STREAM = 0x4a57;

/**
 * ログイントークンの署名の鍵と、鍵を知らずに作ったトークンを用意する。鍵は seed から決まるので、同じ seed からは同じトークンが発行される。
 * forged は中身を利用者の名前にして、でたらめな署名を付けたもの。unsigned は「署名なし」（alg: none）を名乗り、署名を付けないもの
 */
function tokenFixture(db: Parameters<FixtureGenerator>[0], seed: number, refs: Record<string, JsonPrimitive>): void {
  const next = random(seed ^ TOKEN_STREAM);
  const bytes = () => toBase64Url(Uint8Array.from({ length: 32 }, () => Math.floor(next() * 256)));
  db.exec({ sql: 'INSERT INTO token_keys (id, secret) VALUES (1, ?)', bind: [bytes()] });
  for (const key of USERS) {
    refs[`tokens.${key}.forged`] = composeToken(TOKEN_HEADER, { sub: key }, bytes());
    refs[`tokens.${key}.unsigned`] = composeToken({ alg: 'none', typ: 'JWT' }, { sub: key }, '');
  }
}

export const memoFixture: FixtureGenerator = (db, seed) => {
  const next = random(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const refs: Record<string, JsonPrimitive> = {};

  // 利用者 ID は 3 桁、メモ ID は 4 桁の連番。いずれも seed ごとに変わる
  let userId = 100 + Math.floor(next() * 800);
  USERS.forEach((key) => {
    const id = (userId += 1 + Math.floor(next() * 30));
    db.exec({ sql: 'INSERT INTO users (id, key, name) VALUES (?, ?, ?)', bind: [id, key, key] });
    refs[`users.${key}.id`] = id;
  });

  let memoId = 1000 + Math.floor(next() * 8000);
  const insertMemo = (owner: string, title: string, body: string): number => {
    const id = memoId++;
    db.exec({ sql: 'INSERT INTO memos (id, owner_id, title, body) VALUES (?, ?, ?, ?)', bind: [id, refs[`users.${owner}.id`]!, title, body] });
    return id;
  };

  for (const owner of USERS) {
    const [title, body] = pick(TOPICS);
    refs[`memos.${owner}.other.id`] = insertMemo(owner, title!, body!);
    const secret = `${pick(SECRETS)}（${owner}）`;
    refs[`memos.${owner}.private.id`] = insertMemo(owner, '非公開のメモ', secret);
    refs[`memos.${owner}.private.body`] = secret;
  }
  // 検索用：全員が「週報」を持つ（所有者条件の確認）。alice は引用符を含むメモも持つ
  for (const owner of USERS) {
    refs[`memos.${owner}.report.id`] = insertMemo(owner, `週報（${1 + Math.floor(next() * 12)}月）`, '今週の進捗をまとめる');
  }
  refs['memos.alice.quoted.id'] = insertMemo('alice', "O'Reilly の本を読む", '第1章の要点を書き出す');
  refs['search.term'] = '週報';
  refs['search.quoted'] = "O'Reilly";
  refs['search.none'] = '該当しない語句';
  refs['memos.missing.id'] = memoId + 100;

  // 共有教材ページと、ほかの利用者の既存コメント
  const pageId = 10 + Math.floor(next() * 80);
  db.exec({ sql: 'INSERT INTO pages (id, title, body) VALUES (?, ?, ?)', bind: [pageId, '共有ページ：今週の学習メモ', '今週学んだことをコメントで共有しましょう。'] });
  refs['pages.shared.id'] = pageId;
  let commentId = 100 + Math.floor(next() * 800);
  for (const [author, body] of [
    ['bob', '索引の作り方がわかりやすかったです'],
    ['carol', '来週は演習問題を解いてみます'],
  ] as const) {
    db.exec({ sql: 'INSERT INTO comments (id, page_id, author_id, body) VALUES (?, ?, ?, ?)', bind: [commentId, pageId, refs[`users.${author}.id`]!, body] });
    refs[`comments.${author}.id`] = commentId++;
    refs[`comments.${author}.body`] = body;
  }
  tokenFixture(db, seed, refs);
  return refs;
};
