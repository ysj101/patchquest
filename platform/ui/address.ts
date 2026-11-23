// アドレス欄といまの画面を揃える。画面を移るたびに URL を書き換え、ブラウザの戻る・進むや URL の書き換えで来たら、その画面を開かせる
import { isRouteHash, parseRoute, routeHash, type Route } from './route';

const same = (first: Route | null, second: Route): boolean => !!first && routeHash(first) === routeHash(second);

export class AddressBar {
  private shown: Route = { page: 'list' };

  /** open は、アドレス欄がいまの画面と違う画面を指したときに呼ぶ。読めない URL では null を渡す */
  constructor(open: (route: Route | null) => void) {
    window.addEventListener('popstate', () => {
      // 「本文へ移動」（#main）のようなページ内リンクは画面の移動ではない
      if (location.hash !== '' && !isRouteHash(location.hash)) return;
      const route = this.read();
      if (!same(route, this.shown)) open(route);
    });
  }

  /** アドレス欄が指す画面。読めない URL は null */
  read(): Route | null {
    return parseRoute(location.hash);
  }

  /** いまの画面を URL に載せる。開けなかった URL から移ったとき（replace）は、戻るで同じ URL に戻らないよう履歴を置き換える */
  show(route: Route, replace = false): void {
    this.shown = route;
    if (same(this.read(), route)) return;
    if (replace) history.replaceState(null, '', routeHash(route));
    else history.pushState(null, '', routeHash(route));
  }
}
