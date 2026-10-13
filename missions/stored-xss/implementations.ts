// 保存型 XSS パックの実装。注入する危険な描画と、不十分な対策・正常系を壊す対策。
// 正しい対策（textContent）は教材アプリの基準実装 memo/comment-text を使う
import type { ImplementationRegistry } from '../../platform/contract';
import type { RenderComment } from '../../apps/memo/hooks';

/** 注入する脆弱な実装。コメントを HTML として解釈する（検証済みペイロードの onerror が実行される） */
const renderHtml: RenderComment = (el, comment) => {
  el.innerHTML = comment.body;
};

/** 対策（不十分）。script タグだけを消してから HTML として解釈する。イベント属性は残る */
const stripScript: RenderComment = (el, comment) => {
  el.innerHTML = comment.body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
};

/** 対策（正常系が壊れる）。コメント本文を出さない。攻撃は動かないが、普通のコメントも読めない */
const hideAll: RenderComment = (el) => {
  el.textContent = '';
};

export const IMPLEMENTATIONS: ImplementationRegistry = {
  'stored-xss/render-html': { hook: 'comment.render', run: renderHtml },
  'stored-xss/strip-script': { hook: 'comment.render', run: stripScript },
  'stored-xss/hide-all': { hook: 'comment.render', run: hideAll },
};
