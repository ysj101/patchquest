# apps/board

教材アプリ「掲示板」。リクエストごとにページ（HTML）と応答ヘッダを返し、ブラウザが本物の HTTP 応答として開く（必要機能 `http-pages`。仕組みは [runtimes/browser/README.md](../../runtimes/browser/README.md) と [docs/poc/service-worker-http.md](../../docs/poc/service-worker-http.md)）。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック。`GET /board`（掲示板のページ。サーバの設定で決めた応答ヘッダを付ける）、`GET`・`POST /admin/headers`（応答ヘッダの設定。管理者だけ。保存すると 303 で設定のページへ戻す）。主体はセッションから解決する |
| `hooks.ts` | 交換点と基準実装。`board.headers.provision`（配備時に、掲示板のページの応答へ付けるヘッダを決める。基準は `Content-Security-Policy: script-src 'self'`）、`board.comment.render`（コメントの本文を HTML に入れる。基準は文字として入れる）。いずれも契約 1、サーバ側 |
| `fixtures.ts` | seed から架空のコメントを作る `board.default`。利用者は admin（管理者）・alice・bob。検証済みの固定の攻撃コメント（`<script>pqMarker()</script>`）を 1 件含む |
| `enhance.ts` | ページの中で動く、アプリ自身のスクリプト（コメントを数えて件数を書きこむ）。ページと同じ場所から配る `assets/page.js` が呼ぶ |
| `pages.css` | ページの見た目。`assets/board-pages.css` として配る |
| `events.ts` | 観測ログでの、ページで起きたこと・やり取り（状態コード・応答ヘッダ・本文）・ヘッダの保存の表示 |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |

ページの作りの約束：

- スクリプトとスタイルは、文書の中に書かず、静的ファイル（`page.js`・`board-pages.css`）を相対パスで読みこむ。CSP で「同じ場所のファイルだけ」に絞っても、アプリ自身のスクリプトが動くようにするため。
- ページからは `fetch` を使えない（不透明なオリジンの文書からの取得は、サーバ役の Service Worker に届かない）。操作はリンクとフォームで行う。
- 自由にコメントを書きこむ機能は置かない。攻撃コメントは固定の文字列だけで、教材用の実行マーカーを呼ぶほかは何もしない（spec §14）。
- 設定のページの応答には、設定したヘッダを付けない。誤った値を保存しても、設定のページは開けて直せる。

観測イベント：`dom.marker`（ページに書きこまれたスクリプトの実行。教材用の実行マーカー）、`csp.violation`（ブラウザが CSP に従って止めたもの。`securitypolicyviolation` の `effectiveDirective` と `blockedURI`）、`board.counted`（ページ自身のスクリプトが数えたコメントの件数）、`headers.changed`（応答ヘッダの設定の保存）、`app.error`（例外）。
