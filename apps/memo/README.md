# apps/memo

教材アプリ「メモ帳」。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック（`/api/me`、`/api/memos` の CRUD）。主体はセッションから解決し、リクエストの値は使わない |
| `hooks.ts` | 交換点と基準実装。`memo.read.authorize`（ID 指定の取得と認可、契約 1） |
| `fixtures.ts` | seed から架空の利用者（alice・bob・carol）とメモを作る `memo.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `view.ts` | 隔離 iframe 内の画面。教材データは textContent でだけ表示する |

観測イベント：`authz.decision`（認可の判断）、`validation.failed`（入力検証の失敗）、`app.error`（例外）。
