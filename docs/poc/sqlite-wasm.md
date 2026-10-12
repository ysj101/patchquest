# PoC: Web Worker 上の SQLite WASM

Issue #2。SQLi 演習と教材アプリのデータ層の前提として、ブラウザ内の SQLite が使えるかを確かめた。

## 結論

**採用する。** 公式の `@sqlite.org/sqlite-wasm` を module Worker 内でメモリ DB として使う。localhost の静的サーバ（`python3 -m http.server`）だけで動き、COOP/COEP ヘッダは不要。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-10-12 |
| 端末 | Apple M2、macOS 27.0.1 |
| ブラウザ | Google Chrome 154.0.8037.98、Microsoft Edge 155.0.4283.45（Playwright の `channel` で起動） |
| 静的サーバ | Python 3.14.6 `http.server`（`--bind 127.0.0.1`） |
| SQLite WASM | `@sqlite.org/sqlite-wasm` 3.53.4-build2 |
| 再現手順 | `pnpm run test:e2e tests/e2e/poc-sqlite.spec.ts`（検証ページは `tests/pages/poc-sqlite*`） |

## 結果

| 確認項目 | 結果 |
| - | - |
| 同梱ファイルからの読み込み | `sqlite3.wasm` を Worker と同じディレクトリから取得。`Content-Type: application/wasm` で配信され、外部取得なし |
| 冷起動（新しいブラウザコンテキスト） | Worker 生成から DB 準備完了まで Chrome 38〜47ms、Edge 42〜54ms（各5回）。OS のファイルキャッシュも冷えた初回は Chrome 158ms |
| クエリの観測 | 実行した SQL 文字列・バインド値・返却行（所有者 ID を含む）を Worker から返せる |
| 文字列結合の再現 | `x' OR 1=1 --` で所有者条件を迂回し、別ユーザーの行が返る |
| パラメーター化クエリ | 同じ入力で他人の行は返らない。日本語・引用符（`O'Reilly`）・該当なしを正しく扱う。文字列結合では引用符入りの検索が構文エラーになる |
| 停止 | 終わらないクエリ（再帰 CTE）を 1 秒のタイムアウトで停止できた。WASM の実行は外から中断できないため、Worker ごと `terminate()` する |
| 再初期化 | 新しい Worker で 22〜88ms で再起動し、追加したデータが消えた初期状態に戻る |
| 成果物サイズ | `sqlite3.wasm` 869KB、Worker バンドル 216KB（minify 済み） |

## 実装への反映（#4・#5）

- RuntimeAdapter は実行インスタンスごとに Worker を 1 つ持つ。タイムアウト時は Worker を破棄して作り直し、DB は fixture と seed から再構築する。中断 API には頼らない。
- `sqlite3.wasm` は `new URL('sqlite3.wasm', import.meta.url)` で解決されるため、ビルドでは SQLite を読み込む Worker バンドルと同じディレクトリへコピーする。
- SQL の観測イベントには、クエリ形・バインド値・返却行の所有者を含める（spec §8.3 の評価証拠）。
- OPFS などの永続化は使わない。SQLite が OPFS を使えないときの警告文に説明ページの URL が含まれるため、外部参照チェックの許可リストに追加した（読み込みには使われない）。

## 注意点

- `.wasm` を `application/wasm` 以外で配信する古い環境では、ストリーミングコンパイルが失敗して ArrayBuffer 経由の読み込みに切り替わり、コンソールにエラーが出る（動作は継続）。README の静的サーバ要件で扱う。
- 計測値は上記の端末での参考値で、性能の保証ではない。
