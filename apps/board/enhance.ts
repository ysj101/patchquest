// 掲示板のページの中で動く、アプリ自身のスクリプト。ページと同じ場所から配る静的ファイル（assets/page.js）が呼ぶ
import type { PageContext } from '../../runtimes/browser/app-module';

/** コメントを数えて、ページに件数を書きこむ。ブラウザがスクリプトを止めたページでは動かず、件数は出ない */
export function enhance(document: Document, ctx: PageContext): void {
  const count = document.getElementById('count');
  if (!count) return;
  const total = document.querySelectorAll('.comments > li').length;
  count.textContent = `コメント ${String(total)} 件`;
  ctx.emit('board.counted', { count: total });
}
