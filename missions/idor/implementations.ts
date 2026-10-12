// IDOR パックの実装。注入する脆弱な実装と、正常系を壊す対策の実装（正しい対策・リンクを隠す対策は教材アプリの基準実装を使う）
import type { ImplementationRegistry } from '../../platform/contract';
import { readMemoWith, type PickNeighbors } from '../../apps/memo/hooks';

/** 注入する脆弱な実装：ログインしていれば、誰のメモでも ID 指定で返す */
const readWithoutOwnerCheck = readMemoWith(() => ({ allow: true, reason: 'ログインしている' }));

/** 対策（正常系が壊れる）：ID 指定の取得をすべて断る。所有者の取得もできなくなる */
const readDenyAll = readMemoWith(() => ({ allow: false, reason: 'ID 指定の取得をすべて断る' }));

/** 注入する脆弱な画面：前後の移動先を番号の隣で決める。他人のメモへのリンクも出る */
const neighborsByNumber: PickNeighbors = ({ id }) => ({ prev: id - 1, next: id + 1 });

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'idor/read-without-owner-check': { hook: 'memo.read.authorize', run: readWithoutOwnerCheck },
  'idor/read-deny-all': { hook: 'memo.read.authorize', run: readDenyAll },
  'idor/neighbors-by-number': { hook: 'memo.detail.neighbors', run: neighborsByNumber },
};
