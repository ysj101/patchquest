# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`、`/api/memos` の CRUD、`/api/pages`（共有ページとコメント）、`/api/search`（自分のメモの検索）、`/api/import`（XML からのメモの取り込み））。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可）、`memo.search.query`（検索クエリの組み立て。値はバインドし所有者条件を付ける）、`comment.render`（コメントの描画。画面側、textContent）、`memo.title.validate`（保存するタイトルの文字数の検証）、`memo.title.input`（作成・編集画面のタイトル入力欄の上限。画面側）、`memo.detail.neighbors`（詳細画面の「前のメモ」「次のメモ」の移動先。画面側、自分のメモの中から選ぶ）、`memo.import.parse`（取り込む XML を libxml2 に渡す処理。実体は置き換え、外部実体と外部の DTD は読まない）。いずれも契約 1 |
| `import.ts` | メモの取り込み。XML を libxml2 で解析し、`<memos>` の中の `<memo>`（`<title>` と `<body>`）を、取り込んだ利用者のメモとして保存する。パーサーが外部の資源として読めるのは、初期データが作ったサーバの中のファイル（架空。`server_files`）だけ |
| `import-xml.ts` | 取り込みで使う XML の見本と、サーバの中のファイル（架空）の場所 |
| `import-tests.ts` | 取り込みの、アプリ共通のテスト |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモ、サーバの中のファイル（`/etc/hostname` と `/srv/memo/.env`。架空）を作る `memo.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent で表示する。コメント本文は交換点 `comment.render` が描き、描画後の文字列を `comment.rendered` として記録する |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`sql.query`（検索のクエリ形・バインド値・返却行の所有者）、`sql.error`（検索クエリの失敗）、`comment.rendered`（画面に出たコメントの文字列）、`xml.parse`（取り込みでパーサーに渡したオプション・パーサーが求めた資源の URI・渡したバイト数）、`dom.marker`（画面での実行マーカー）、`app.error`（例外）。
