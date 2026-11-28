// ページを返すアプリ（http-pages）で、Service Worker・ページ・Host の間を行き来するメッセージ
import type { AppRequest, AppResponse, ObservedEvent } from '../../../platform/contract';

/** ページの URL は <assets>/pages/<開いた回ごとの札>/<アプリの中のパス>。Service Worker のスコープは <assets>/pages/ */
export const PAGES_DIR = 'pages/';
export const SERVICE_WORKER_FILE = 'pages-sw.js';
export const PAGE_SCRIPT_FILE = 'page.js';

/**
 * Service Worker がすべての応答に付ける CSP。文書を不透明なオリジンにして、学習UIの保存領域・DOM に届かないようにする（spec §14）。
 * スクリプトとフォームの送信だけを許す。教材アプリが付けた CSP とは別のポリシーとして、両方が効く
 */
export const ISOLATION_POLICY = 'sandbox allow-scripts allow-forms';

/** Service Worker → Host。札の持ち主（そのページを開いた枠）だけが応答を返す。返事は一緒に渡したポートへ送る */
export interface RelayAsk {
  pqPages: { token: string; request: AppRequest };
}

/** Host → Service Worker。札を知らない Host は null を返す */
export type RelayAnswer = { response: AppResponse } | null;

/** ページ → Host。ページの中で起きたこと（スクリプトの実行・ブラウザが止めたもの）の知らせ */
export interface PageNotice {
  pqPage: string;
  event: ObservedEvent;
}
