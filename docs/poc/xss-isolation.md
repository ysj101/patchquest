# PoC: XSS 演習用の隔離 iframe

Issue #3。保存型 XSS を実 DOM で再現しながら、プラットフォーム本体（Host）を保護できるかを確かめた。

## 結論

**再現と隔離は両立する。** 次の構成を採用する。

1. 教材アプリの表示は `sandbox="allow-scripts"` だけを付けた iframe に置く。origin は不透明（opaque）になる。
2. iframe の文書は実 URL の静的 HTML とし、`<meta>` の CSP で `default-src 'none'` を基本にする。スクリプトはクラシックスクリプトとしてインライン化し、**フレーム自身のスクリプトと、検証済みペイロードのイベントハンドラーだけをハッシュで許可する**（`'unsafe-inline'` は使わない）。
3. 自由入力の HTML によるフレームの遷移は Trusted Types の default ポリシーで止める（後述）。
4. Host は受け取ったメッセージを、送信元ウィンドウ・スキーマ・実行 ID で照合する。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-10-12 |
| 端末 | Apple M2、macOS 27.0.1 |
| ブラウザ | Google Chrome 154.0.8037.98、Microsoft Edge 155.0.4283.45 |
| 静的サーバ | Python 3.14.6 `http.server`（`--bind 127.0.0.1`） |
| 再現手順 | `npm run test:e2e -- tests/e2e/poc-xss.spec.ts`（検証ページは `tests/pages/poc-xss*`） |

## 確定した設定

| 項目 | 値 |
| - | - |
| iframe | `sandbox="allow-scripts"`（allow-same-origin・allow-popups・allow-top-navigation・allow-forms・allow-downloads なし） |
| フレームの CSP | `default-src 'none'; script-src 'sha256-<フレームのスクリプト>' 'unsafe-hashes' 'sha256-<検証済みハンドラー>'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types default pq-inert` |
| 検証済みペイロード（PoC） | `<img src="x" onerror="pqMarker()">`。`pqMarker()` はフレームが用意する無害な実行マーカーで、呼ばれると Host へ通知する |
| スクリプトの配置 | ビルド時にフレーム用スクリプトを IIFE でインライン化し、ハッシュを CSP に埋め込む（`scripts/build.mjs` の `buildSandboxDocument`）。外部スクリプトの読み込みは不透明な origin から CORS が必要な取得になるため、試さずに避けた |

## 結果

### 再現（本番想定の CSP）

| 確認項目 | 結果 |
| - | - |
| 危険な HTML 解釈（`innerHTML`） | 検証済みペイロードが実 DOM で実行され、実行マーカーが Host に届いた |
| `textContent` での描画 | マーカーは発生せず、ペイロードや `日本語 & <b>角括弧</b> "記号"` が文字のまま表示された |
| 画像の読み込み | `img-src` が CSP で止まり、通信は発生しない。`onerror` は発火する |
| 検証していないハンドラー | `pqMarker();` のように 1 文字違うだけでハッシュが一致せず、`script-src-attr` 違反で実行されない |
| `innerHTML` で挿入した `<script>` | HTML の仕様どおり実行されない。「script タグだけ削除」が不十分な対策であることの教材上の根拠になる |

### 隔離（sandbox だけの効果を見るため、任意のインラインスクリプトを許可したフレームで確認）

| 試みた操作 | 結果（Chrome・Edge 共通） |
| - | - |
| Host の DOM を読む（`parent.document`） | SecurityError |
| Host の localStorage を読む | SecurityError |
| 自分の localStorage・Cookie・IndexedDB | いずれも SecurityError（不透明な origin のため） |
| `fetch` で外部へ送信 | TypeError。CSP の `connect-src` 違反で通信前に停止 |
| `navigator.sendBeacon` | `true` を返すが CSP の `connect-src` 違反で送信されない |
| 外部画像の読み込み | CSP の `img-src` 違反で送信されない |
| ポップアップ（`window.open`） | `null`（開かない） |
| トップ遷移（`top.location`） | SecurityError。Host の URL は変わらない |
| フォーム送信 | 送信されず、フレームは遷移しない |
| ダウンロード | 発生しない |
| localhost 以外への通信 | 全テストを通して 0 件（E2E の共通フィクスチャで遮断・検査） |

### メッセージの照合

| 確認項目 | 結果 |
| - | - |
| Host 自身のウィンドウから送った正しい形のメッセージ | 送信元ウィンドウ不一致で破棄 |
| フレームからの文字列だけのメッセージ | スキーマ不一致で破棄 |
| 推測した実行 ID・切り替え前の実行 ID のメッセージ | 実行 ID 不一致で破棄 |

## 見つかった課題と対策：自由入力の HTML によるフレームの遷移

sandbox はフレーム**自身**の遷移を禁止しない。CSP も遷移を制御しない。そのため、危険な HTML 解釈が有効なときに自由入力のコメントへ `<meta http-equiv="refresh" content="0;url=...">` を書くと、スクリプトを使わずにフレームが遷移した（検証では同一 origin の URL で確認）。遷移先が外部なら通信が発生しうる。

対策として、フレームで Trusted Types を必須にし、default ポリシーで描画前に**許可した要素と属性だけを残す**（書式用の要素・`img`・`svg` と、`on*`・`alt`・`title`・`img` の `src`）。遷移を起こす `meta`・`a`・`form`・`base` などは列挙せずとも除かれる。イベントハンドラーの実行可否は CSP のハッシュで決まるため、ガードは XSS の再現を妨げない。ガードを有効にすると遷移は起きず、同じ描画内の検証済みペイロードは実行された。なお、ガードは解析した DOM を文字列へ戻してから描画するため、再解析で構造が変わる入力（mutation XSS）までは防がない。実行できるハンドラーは CSP のハッシュで限られるため、残る影響はフレーム内の表示に限られる。

## 実装への反映

- #5：プレビュー用の iframe 文書を `buildSandboxDocument` で生成し、上記の sandbox・CSP・遷移ガード・メッセージ照合を組み込む。
- #18（XSS 課題）：検証済みペイロードのハンドラーのハッシュをカタログから CSP に追加する。攻撃コメントは検証済みの固定ペイロードから選ぶ方式とする。
- Host のログと教材入力は文字列としてのみ描画する（spec §14）。
