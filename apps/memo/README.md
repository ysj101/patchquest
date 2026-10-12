# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`、`/api/memos` の CRUD、`/api/pages`（共有ページとコメント）、`/api/search`（自分のメモの検索））。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可）、`memo.search.query`（検索クエリの組み立て。値はバインドし所有者条件を付ける）、`comment.render`（コメントの描画。画面側、textContent）。いずれも契約 1 |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモを作る `memo.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent でだけ表示する |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`sql.query`（検索のクエリ形・バインド値・返却行の所有者）、`sql.error`（検索クエリの失敗）、`dom.marker`（画面での実行マーカー）、`app.error`（例外）。
