// CSP のパックが注入する実装。応答ヘッダの付け忘れ（設定の初期値）と、コメントをそのまま HTML に入れる描画
import { HEADERS_HOOK, RENDER_HOOK, type ProvisionHeaders, type RenderComment } from '../../apps/board/hooks';
import type { ImplementationRegistry } from '../../platform/contract';

export const IMPLEMENTATIONS: ImplementationRegistry = {
  // 配備のとき、掲示板のページの応答にヘッダを何も付けない
  'csp/no-policy': { hook: HEADERS_HOOK, run: (() => ({})) satisfies ProvisionHeaders },
  // コメントの本文を、そのまま HTML に入れる（表示の直しが済んでいない状態）
  'csp/comment-raw': { hook: RENDER_HOOK, run: ((body) => body) satisfies RenderComment },
};
