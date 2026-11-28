# runtimes/browser

ブラウザ用の RuntimeAdapter（spec §11.2, §14）。教材アプリの起動・操作・実装切替・観測・破棄を担う。

| ファイル | 役割 |
| - | - |
| `adapter.ts` | Host 側の `BrowserRuntimeAdapter`。Worker とプレビューを持ち、呼び出しに attemptId・runId を付けて照合する。タイムアウト時は Worker を破棄する |
| `worker.ts` | 教材ロジックを動かす Worker の入口。Host からの呼び出しを `engine.ts` へ渡し、初期化後に `lockdown.ts` で外への手段を塞ぐ |
| `engine.ts` | 教材ロジックと SQLite（メモリ DB）を動かす本体（`AppEngine`）。セッションは演習ハーネスの `session` 呼び出しでだけ発行する。Worker に依存しないので Node のテストでも使う |
| `machine.ts` | 演習用の機械（v86 で動かす本物の Linux）の起動と、シリアル回線越しのやり取り |
| `sqlite.ts` | SQLite（wasm）のメモリ DB を開く |
| `protocol.ts` | Host・Worker・プレビューの間で交わすメッセージの型 |
| `preview/` | 教材アプリの画面を動かす隔離 iframe（`sandbox="allow-scripts"`）。CSP は自身のスクリプトと `pqMarker()` だけをハッシュで許可する。URL に `#` が付いているときは、教材アプリの画面がさらに埋め込んだページとして動く（枠に開けるのは同じ配信元の文書だけ。[PoC](../../docs/poc/postmessage-origin.md)） |
| `preview-host.ts` | プレビューとのメッセージを送信元ウィンドウ・スキーマ・runId で照合する |
| `embed.ts` | 教材アプリの画面が埋め込むページ（`AppModule.embeds`）を指す、URL の `#` 以降の組み立てと読み取り |
| `registry.ts` | カタログに登録された教材アプリと実装の解決 |
| `lockdown.ts` | Worker の初期化後に通信・保存の API を使えなくする |
| `app-module.ts` | 教材アプリが満たす形（`AppModule`）とカタログの型 |

教材アプリと課題パックは `@catalog`（通常は `catalog/index.ts`、`--test` ビルドでは `tests/support/catalog.ts`）から読み込む。設計の根拠は [docs/poc/](../../docs/poc/) の PoC 記録を参照。
