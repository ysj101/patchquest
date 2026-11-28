// 掲示板の交換点（課題パックが脆弱な実装を注入する場所）と、安全な基準実装
import type { HookDescriptor, ImplementationRegistry } from '../../platform/contract';
import { escapeHtml } from '../../runtimes/browser/pages/document';

export const HEADERS_HOOK = 'board.headers.provision';
export const RENDER_HOOK = 'board.comment.render';

/** 配備時に、掲示板のページの応答へ付けるヘッダを決める（名前は小文字） */
export type ProvisionHeaders = () => Record<string, string>;
/** コメントの本文を、ページの HTML に入れる形にする */
export type RenderComment = (body: string) => string;

export const CSP_HEADER = 'content-security-policy';

export const HOOKS: HookDescriptor[] = [
  {
    id: HEADERS_HOOK,
    realm: 'server',
    contract: 1,
    baseline: 'board/headers-script-self',
    description: '配備時に、掲示板のページの応答へ付けるヘッダを決める処理（サーバの設定の初期値になる）',
  },
  {
    id: RENDER_HOOK,
    realm: 'server',
    contract: 1,
    baseline: 'board/comment-escaped',
    description: 'コメントの本文を、ページの HTML に入れる処理',
  },
];

/** スクリプトは、ページと同じ場所から配るファイルだけを動かす */
const scriptSelf: ProvisionHeaders = () => ({ [CSP_HEADER]: "script-src 'self'" });

export const BASELINE: ImplementationRegistry = {
  'board/headers-script-self': { hook: HEADERS_HOOK, run: scriptSelf },
  'board/comment-escaped': { hook: RENDER_HOOK, run: escapeHtml satisfies RenderComment },
};
