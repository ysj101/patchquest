// メモアプリが公開する交換点（フック）と、その安全な基準実装
import type { HookDescriptor, ImplementationRegistry } from '../../platform/contract';
import type { ServerContext } from '../../runtimes/browser/app-module';
import { TITLE_MAX_LENGTH, emitDecision, findMemo, lengthError, type Memo, type User } from './model';

export type ReadResult = { status: 'ok'; memo: Memo } | { status: 'unauthenticated' | 'not-found' | 'forbidden' };

/** ID 指定でメモを取得する処理（認可を含む）。契約 1 */
export type ReadMemo = (ctx: ServerContext, request: { id: number; user: User | null }) => ReadResult;

/**
 * 自分のメモを探す検索クエリを組み立てる処理。教材ロジックが実行し、クエリ形・バインド値・返却行の所有者を記録する。
 * クエリは列 id・ownerId・title を返す。契約 1
 */
export type BuildSearchQuery = (input: { userId: number; q: string }) => { sql: string; bind: (string | number)[] };

/** 共有ページのコメント 1 件を描画する処理（画面側）。契約 1 */
export type RenderComment = (el: HTMLElement, comment: { body: string }) => void;

/**
 * 保存するメモのタイトル（空でない文字列）を検証する処理。問題があれば利用者に示す説明を返す。
 * 型と未入力の検査は教材ロジックが先に行う。契約 1
 */
export type ValidateTitle = (title: string) => { ok: true } | { ok: false; message: string };

/** メモの作成・編集画面のタイトル入力欄を整える処理（画面側）。契約 1 */
export type PrepareTitleInput = (input: HTMLInputElement) => void;

/**
 * メモの詳細画面に出す「前のメモ」「次のメモ」の移動先を決める処理（画面側）。移動先がなければ null。
 * ownIds は閲覧者自身のメモの ID。画面のリンクを決めるだけで、取得してよいかの判断（認可）はしない。契約 1
 */
export type PickNeighbors = (input: { id: number; ownIds: number[] }) => { prev: number | null; next: number | null };

export const HOOKS: HookDescriptor[] = [
  {
    id: 'memo.read.authorize',
    realm: 'server',
    contract: 1,
    baseline: 'memo/read-owner-check',
    description: 'ID 指定でメモを取得する処理。取得してよいかの判断（認可）を含む',
  },
  {
    id: 'memo.search.query',
    realm: 'server',
    contract: 1,
    baseline: 'memo/search-parameterized',
    description: '自分のメモを探す検索クエリを組み立てる処理',
  },
  {
    id: 'comment.render',
    realm: 'view',
    contract: 1,
    baseline: 'memo/comment-text',
    description: '共有ページのコメントを画面に描画する処理',
  },
  {
    id: 'memo.title.validate',
    realm: 'server',
    contract: 1,
    baseline: 'memo/title-max-length',
    description: '保存するメモのタイトルを検証する処理（文字数の上限）',
  },
  {
    id: 'memo.title.input',
    realm: 'view',
    contract: 1,
    baseline: 'memo/title-input-max-length',
    description: 'メモの作成・編集画面のタイトル入力欄を整える処理（文字数の上限）',
  },
  {
    id: 'memo.detail.neighbors',
    realm: 'view',
    contract: 1,
    baseline: 'memo/neighbors-own',
    description: 'メモの詳細画面の「前のメモ」「次のメモ」の移動先を決める処理',
  },
];

const readOwnerCheck: ReadMemo = (ctx, { id, user }) => {
  if (!user) {
    emitDecision(ctx, 'read', null, null, 'deny', 'ログインしていない');
    return { status: 'unauthenticated' };
  }
  const memo = findMemo(ctx.db, id);
  if (!memo) return { status: 'not-found' };
  if (memo.ownerId !== user.id) {
    emitDecision(ctx, 'read', user, memo, 'deny', '所有者ではない');
    return { status: 'forbidden' };
  }
  emitDecision(ctx, 'read', user, memo, 'allow', '所有者である');
  return { status: 'ok', memo };
};

/** LIKE の特殊文字（% と _）を文字として扱う */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** 検索語は値としてバインドし、所有者条件を必ず付ける */
const searchParameterized: BuildSearchQuery = ({ userId, q }) => {
  const pattern = `%${escapeLike(q)}%`;
  return {
    sql: "SELECT id, owner_id AS ownerId, title FROM memos WHERE owner_id = ? AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') ORDER BY id",
    bind: [userId, pattern, pattern],
  };
};

/** コメントは文字として表示する（本文はプレーンテキスト仕様） */
const commentText: RenderComment = (el, comment) => {
  el.textContent = comment.body;
};

/** タイトルは上限の文字数まで */
const titleMaxLength: ValidateTitle = (title) => {
  const message = lengthError('タイトル', title, TITLE_MAX_LENGTH);
  return message ? { ok: false, message } : { ok: true };
};

/** 入力欄でも上限を示す。画面だけの制限なので、保存時の検証の代わりにはならない */
const titleInputMaxLength: PrepareTitleInput = (input) => {
  input.maxLength = TITLE_MAX_LENGTH;
};

/** 前後の移動先は、閲覧者自身のメモの中から選ぶ */
const neighborsOwn: PickNeighbors = ({ id, ownIds }) => {
  const before = ownIds.filter((own) => own < id);
  const after = ownIds.filter((own) => own > id);
  return { prev: before.length > 0 ? Math.max(...before) : null, next: after.length > 0 ? Math.min(...after) : null };
};

export const BASELINE: ImplementationRegistry = {
  'memo/read-owner-check': { hook: 'memo.read.authorize', run: readOwnerCheck },
  'memo/search-parameterized': { hook: 'memo.search.query', run: searchParameterized },
  'memo/comment-text': { hook: 'comment.render', run: commentText },
  'memo/title-max-length': { hook: 'memo.title.validate', run: titleMaxLength },
  'memo/title-input-max-length': { hook: 'memo.title.input', run: titleInputMaxLength },
  'memo/neighbors-own': { hook: 'memo.detail.neighbors', run: neighborsOwn },
};
