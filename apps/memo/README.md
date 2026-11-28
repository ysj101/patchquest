# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`（表示名の変更は `profile.ts`）、`/api/memos` の CRUD、`/api/pages`（共有ページとコメント）、`/api/search`（自分のメモの検索））。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可）、`memo.search.query`（検索クエリの組み立て。値はバインドし所有者条件を付ける）、`comment.render`（コメントの描画。画面側、textContent）、`memo.title.validate`（保存するタイトルの文字数の検証）、`memo.title.input`（作成・編集画面のタイトル入力欄の上限。画面側）、`memo.detail.neighbors`（詳細画面の「前のメモ」「次のメモ」の移動先。画面側、自分のメモの中から選ぶ）。いずれも契約 1 |
| `profile.ts` | 表示名の変更（`PUT /api/me`）と、その入力チェックの交換点 `profile.name.validate`（契約 1）の型・基準の正規表現。正規表現は、正規表現エンジン PCRE2（`ctx.regex`）で照合する。エンジンが処理の上限（match limit。アプリの宣言で 1,000,000）に達したら、名前を変えずに 503 を返す |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモを作る `memo.default` |
| `tests.ts`・`profile-tests.ts` | アプリ共通のテスト。基準実装ではすべて通る。表示名のテストは `profile-tests.ts` |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent で表示する。コメント本文は交換点 `comment.render` が描き、描画後の文字列を `comment.rendered` として記録する |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`sql.query`（検索のクエリ形・バインド値・返却行の所有者）、`sql.error`（検索クエリの失敗）、`comment.rendered`（画面に出たコメントの文字列）、`regex.match`（正規表現の照合：エンジン・パターン・入力・結果・パターンの項目を試した回数・処理の上限。回数は PCRE2 の callout の回数で、後戻りの回数そのものではない）、`dom.marker`（画面での実行マーカー）、`app.error`（例外）。
