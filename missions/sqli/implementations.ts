// SQL インジェクションパックの実装。検索語を SQL へつなぐ注入と、不十分な対策・正常系を壊す対策。
// 正しい対策（値としてのバインド）は教材アプリの基準実装 memo/search-parameterized を使う。
// この教材が実行するのは SQLite。別のデータベース製品の構文までは再現しない
import type { ImplementationRegistry } from '../../platform/contract';
import type { BuildSearchQuery } from '../../apps/memo/hooks';

/**
 * 単語の途中にあるアポストロフィだけを二重にする（O'Reilly が構文エラーにならないようにする）。
 * 値としてバインドしているわけではない。引用符の前後が文字でないときは、SQL の文字列を閉じられる
 */
const soften = (term: string) => term.replace(/(\p{L})'(\p{L})/gu, "$1''$2");

/** 検索語を SQL の文字列へつなぐ。所有者の条件も、つなぎ込まれた検索語の中で書き換えられる */
const concatenated = (userId: number, term: string) => {
  const softened = soften(term);
  return {
    sql: `SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ${userId} AND (title LIKE '%${softened}%' OR body LIKE '%${softened}%') ORDER BY id`,
    bind: [] as (string | number)[],
  };
};

/** 行を返さないパラメーター化クエリ。所有者の ID はバインドしたまま、条件を常に偽にする */
const noRows = (userId: number) => ({
  sql: 'SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ? AND 0',
  bind: [userId],
});

/** 注入する脆弱な実装。検索語を SQL へ文字としてつなぐ */
const searchConcat: BuildSearchQuery = ({ userId, q: term }) => concatenated(userId, term);

/** 対策（不十分）。UNION という語だけを止める。ほかの書き方で所有者の条件は迂回できる */
const searchBlockUnion: BuildSearchQuery = ({ userId, q: term }) => (/union/i.test(term) ? noRows(userId) : concatenated(userId, term));

/** 対策（正常系が壊れる）。検索を止めて行を返さない。漏れは止まるが、自分のメモも探せない */
const searchDisabled: BuildSearchQuery = ({ userId }) => noRows(userId);

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'sqli/search-concat': { hook: 'memo.search.query', run: searchConcat },
  'sqli/search-block-union': { hook: 'memo.search.query', run: searchBlockUnion },
  'sqli/search-disabled': { hook: 'memo.search.query', run: searchDisabled },
};
