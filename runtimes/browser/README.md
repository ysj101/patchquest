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
| `preview/` | 教材アプリの画面を動かす隔離 iframe（`sandbox="allow-scripts"`）。CSP は自身のスクリプトと `pqMarker()` だけをハッシュで許可する |
| `preview-host.ts` | プレビューとのメッセージを送信元ウィンドウ・スキーマ・runId で照合する |
| `registry.ts` | カタログに登録された教材アプリと実装の解決 |
| `pages/pages-host.ts` | ページを返すアプリ（`pages` を持つアプリ。必要機能 `http-pages`）の Host 側。Service Worker を登録し、その問い合わせを、ページを開いた枠へ渡す。枠は `sandbox` 属性を付けず、開いた回ごとの札（URL の一部）で照合する |
| `pages/service-worker.ts` | サーバ役の Service Worker（`assets/pages-sw.js`、スコープは `assets/pages/`）。リクエストを Host へ問い合わせ、返ってきた中身を本物の HTTP 応答にする。すべての応答に隔離の CSP（`sandbox allow-scripts allow-forms`）を付ける。状態は持たず、外へは通信しない |
| `pages/page.ts` | ページが読みこむ静的スクリプト（`assets/page.js`）。実行マーカーと、ブラウザが CSP で止めたものを Host へ知らせ、アプリ自身のスクリプト（`pages.enhance`）を呼ぶ |
| `pages/document.ts` | アプリがページの HTML を組み立てる部品（文字の置き換え・相対リンク・文書の枠） |
| `pages/protocol.ts` | Service Worker・ページ・Host の間のメッセージと、隔離の CSP |
| `lockdown.ts` | Worker の初期化後に通信・保存の API を使えなくする |
| `app-module.ts` | 教材アプリが満たす形（`AppModule`）とカタログの型 |

画面の出し方は、アプリの形で決まる。`render` を持つアプリは隔離 iframe（`preview/`）に描き、`pages` を持つアプリは、`handle` の応答を Service Worker が本物の HTTP 応答にしてページとして開く。後者では、応答ヘッダ（CSP など）に従うかどうかを Chrome が決める。

教材アプリと課題パックは `@catalog`（通常は `catalog/index.ts`、`--test` ビルドでは `tests/support/catalog.ts`）から読み込む。設計の根拠は [docs/poc/](../../docs/poc/) の PoC 記録を参照。
