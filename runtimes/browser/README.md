# runtimes/browser

ブラウザ用の RuntimeAdapter（spec §11.2, §14）。教材アプリの起動・操作・実装切替・観測・破棄を担う。

| ファイル | 役割 |
| - | - |
| `adapter.ts` | Host 側の `BrowserRuntimeAdapter`。Worker とプレビューを持ち、呼び出しに attemptId・runId を付けて照合する。タイムアウト時は Worker を破棄する |
| `worker.ts` | 教材ロジックと SQLite（メモリ DB）を動かす Worker。セッションは演習ハーネスの `session` 呼び出しでだけ発行する |
| `preview/` | 教材アプリの画面を動かす隔離 iframe（`sandbox="allow-scripts"`）。CSP は自身のスクリプトと `pqMarker()` だけをハッシュで許可する |
| `preview-host.ts` | プレビューとのメッセージを送信元ウィンドウ・スキーマ・runId で照合する |
| `registry.ts` | カタログに登録された教材アプリと実装の解決 |
| `lockdown.ts` | Worker の初期化後に通信・保存の API を使えなくする |
| `app-module.ts` | 教材アプリが満たす形（`AppModule`）とカタログの型 |

教材アプリと課題パックは `@catalog`（通常は `catalog/index.ts`、`--test` ビルドでは `tests/support/catalog.ts`）から読み込む。設計の根拠は [docs/poc/](../../docs/poc/) の PoC 記録を参照。
