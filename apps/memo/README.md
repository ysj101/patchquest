# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`、`/api/memos` の CRUD、`/api/pages`（共有ページとコメント）、`/api/search`（自分のメモの検索））。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可）、`memo.search.query`（検索クエリの組み立て。値はバインドし所有者条件を付ける）、`comment.render`（コメントの描画。画面側、textContent）、`memo.title.validate`（保存するタイトルの文字数の検証）、`memo.title.input`（作成・編集画面のタイトル入力欄の上限。画面側）、`memo.detail.neighbors`（詳細画面の「前のメモ」「次のメモ」の移動先。画面側、自分のメモの中から選ぶ）。`stamp.message.accept`（「スタンプを送る」画面に届いたメッセージを、スタンプとして受け入れるかを決める。画面側、送り主の窓がスタンプの部品のときだけ受け入れる）。いずれも契約 1 |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモを作る `memo.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent で表示する。コメント本文は交換点 `comment.render` が描き、描画後の文字列を `comment.rendered` として記録する |
| `stamp-view.ts` | 「スタンプを送る」画面（`/pages/<ID>/stamps`）と、そこへ iframe で埋め込む 2 つのページ（スタンプの部品・広告）。埋め込むページは別の文書・別のオリジンで動き、画面とは本物の `postMessage` でやり取りする。経路に `?press=picker`・`?press=ad` を付けると、その枠が開いた直後にメッセージを 1 回送る（自動テスト用） |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`sql.query`（検索のクエリ形・バインド値・返却行の所有者）、`sql.error`（検索クエリの失敗）、`comment.rendered`（画面に出たコメントの文字列）、`message.received`（「スタンプを送る」画面に届いたメッセージの中身・送り主の窓・`event.origin`・受け入れたか）、`dom.marker`（画面での実行マーカー）、`app.error`（例外）。
