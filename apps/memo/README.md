# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`、`/api/memos` の CRUD、`/api/pages`（共有ページとコメント）、`/api/search`（自分のメモの検索））。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可）、`memo.search.query`（検索クエリの組み立て。値はバインドし所有者条件を付ける）、`comment.render`（コメントの描画。画面側、textContent）、`memo.title.validate`（保存するタイトルの文字数の検証）、`memo.title.input`（作成・編集画面のタイトル入力欄の上限。画面側）、`memo.detail.neighbors`（詳細画面の「前のメモ」「次のメモ」の移動先。画面側、自分のメモの中から選ぶ）。いずれも契約 1 |
| `jwt.ts` | ログイントークン（JWT、RFC 7519）の組み立てと読み取り、HS256（HMAC-SHA256）の署名と検証。WebCrypto（`crypto.subtle`）で行う |
| `token.ts` | ログイントークンの発行（`POST /api/token`。ログインが要る）と、トークンでメモを取り出す要求（`POST /api/token/memos`。セッションを見ず、本文の `token` で利用者を決める）。受け付けてよいかは交換点 `memo.token.verify`（契約 1、非同期）が決め、基準実装は鍵で署名を計算し直して比べる |
| `token-view.ts` | 画面「ログイントークン」。発行したトークンを 3 つの部分に分けて元の文字を示し、中身を書き換えて送れる（読む・書き換えるのに鍵は使わない） |
| `token-scenario.ts` | ログイントークンの共通テストと、課題パックと共用する手順の部品 |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモ、ログイントークンの署名の鍵を作る `memo.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent で表示する。コメント本文は交換点 `comment.render` が描き、描画後の文字列を `comment.rendered` として記録する |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`sql.query`（検索のクエリ形・バインド値・返却行の所有者）、`sql.error`（検索クエリの失敗）、`comment.rendered`（画面に出たコメントの文字列）、`token.checked`（トークンを受け付けたか・断ったかと、署名が鍵で計算した値と合うか）、`dom.marker`（画面での実行マーカー）、`app.error`（例外）。
