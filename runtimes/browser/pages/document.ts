// ページを返すアプリが、応答の HTML を組み立てるための部品。Worker の中（教材ロジック）で使う
import { PAGE_SCRIPT_FILE } from './protocol';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 文字列を、HTML の本文と属性値に文字として入れられる形にする */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const segments = (route: string): number => (route.split('?')[0] ?? '').split('/').filter(Boolean).length;

/** いまのページ（from）から、アプリの中の別のパス（to。/ で始まる）への相対リンク。ページの URL には開いた回ごとの札が入るので、絶対パスでは書けない */
export function pageLink(from: string, to: string): string {
  return `${'../'.repeat(Math.max(segments(from) - 1, 0))}${to.slice(1)}` || './';
}

export interface PageDocument {
  appId: string;
  /** このページのパス（/ で始まる） */
  route: string;
  title: string;
  /** assets/ に置いたスタイルシートのファイル名（apps/<アプリ>/pages.css は <アプリ>-pages.css として配られる） */
  stylesheet: string;
  /** body の中身（HTML）。文字として入れる値は escapeHtml を通す */
  body: string;
}

/**
 * ページの HTML。スクリプトとスタイルは、ページと同じ場所（オリジン）から配る静的ファイルを読み込む。
 * 文書の中にスクリプトを書かないので、CSP で「同じ場所のファイルだけ」に絞ってもアプリ自身のスクリプトは動く
 */
export function pageDocument({ appId, route, title, stylesheet, body }: PageDocument): string {
  const assets = '../'.repeat(segments(route) + 1);
  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="stylesheet" href="${assets}${escapeHtml(stylesheet)}">`,
    `<script src="${assets}${PAGE_SCRIPT_FILE}" data-app="${escapeHtml(appId)}"></script>`,
    '</head>',
    `<body>${body}</body>`,
    '</html>',
  ].join('\n');
}
