# PoC: 隔離 iframe の中の、ページどうしの postMessage

Issue #235。窓どうしの通信（`postMessage`）で送信元を確かめない問題（CWE-346）を、本物の `postMessage` と本物の別オリジンのページで再現できるか、プラットフォームの隔離の約束（spec §14）と両立するかを確かめた。

## 結論

**成り立つ。ただし、送り主を見分けるのは `event.origin` ではなく `event.source` になる。** 次の構成を採用する。

1. 教材アプリの画面（隔離 iframe、`sandbox="allow-scripts"`）が、さらに iframe を 2 枚開く（正しい部品と、知らないページ）。開く文書は、プレビュー自身の文書（`assets/preview.html`）に `#アプリ ID/名前/渡す文字列` を付けたもの。プレビューのスクリプトは、`#` が付いていれば、教材アプリが登録した埋め込みページ（`AppModule.embeds`）だけを描き、学習UI（Host）とはやり取りしない。
2. プレビューの CSP に `frame-src 'self'` を足す。ほかは変えない。
3. 入れ子の枠は、親の sandbox を引き継いで不透明なオリジンになる。画面・Host・となりの枠は、互いの DOM に届かない。届くのは `postMessage` だけ。
4. 画面が受け取ったメッセージの `event.origin` は、どの枠からも文字列 `"null"` になる。送り主は `event.source`（送り主の窓）を、自分で開いた iframe の `contentWindow` と比べて見分ける。

`event.origin` を期待する値（`https://…`）と比べる直し方は、この構成では**手で試せない**（どの枠も `"null"`）。課題では、`"null"` かを確かめる直し方が足りないことを学習者が自分で確かめ、ふつうのページでのオリジンの比べ方は、理解確認と振り返りで扱う。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2、macOS 27.2.1 |
| ブラウザ | Google Chrome 158.0.8127.37 |
| 静的サーバ | Python 3.15.0 `http.server`（`--bind 127.0.0.1`） |
| 再現手順 | 採用した構成は、製品の実装と E2E（`missions/postmessage-origin/__tests__/postmessage-origin.spec.ts`）で確かめる。`node scripts/build.mjs --test` のあと `pnpm exec playwright test missions/postmessage-origin --project chrome`。採用しなかった構成（`frame-src` なし・`srcdoc`）は、作業用の検証ページで 1 回だけ測り、リポジトリには残していない |

作業用の検証ページは、Host のページが `sandbox="allow-scripts"` の iframe を開き、その中のページ（プレビューと同じ形の CSP）が iframe を 2 枚開く形にした。入れ子の枠は、自分から見えたものを親へ `postMessage` で知らせた。

## 結果

### 別オリジンの作り方

| 確認項目 | 結果 |
| - | - |
| CSP に `frame-src` がない（いまの `default-src 'none'` のまま） | 入れ子の iframe は開かない（`frame-src` の違反として止まる） |
| CSP に `frame-src 'self'` を足し、同じ配信元の文書を開く | 開く。sandbox で不透明なオリジンになった文書でも、`'self'` は文書の URL の配信元に合った |
| 入れ子の枠のオリジン | `self.origin` は `"null"`。画面（親）・Host（最上位）・となりの枠の `document` は、どれも SecurityError。`localStorage` と Cookie も SecurityError |
| 画面から入れ子の枠の `document` | SecurityError（画面からも、部品の中には届かない） |
| 入れ子の枠からの、画面と Host の遷移（`parent.location`・`top.location`） | どちらも SecurityError。画面も Host も変わらない |
| `srcdoc` で開く（スクリプトのハッシュを CSP に足す） | 開いて動くが、採用しない。1 枚目の枠が、まだ空の 2 枚目の枠の `document` を読めた（読み込みの前の一時的な文書）。スクリプトのハッシュを課題ごとに CSP へ足す必要もある |

### `event.origin` と `event.source`

| 確認項目 | 結果 |
| - | - |
| 部品の枠が送ったメッセージの `event.origin` | `"null"` |
| 知らないページの枠が送ったメッセージの `event.origin` | `"null"`（部品と同じ文字。**オリジンでは見分けられない**） |
| `event.source === 部品の iframe.contentWindow` | 部品のメッセージでは `true`、知らないページのメッセージでは `false`（**送り主の窓では見分けられる**） |
| 現実の直し方としての正しさ | sandbox を付けた iframe から受け取るときに `e.origin === "null" && e.source === frame.contentWindow` を確かめる書き方は、web.dev の「Play safely in sandboxed IFrames」が示している。MDN の `Window.postMessage()` も、送り主は `origin` と、場合により `source` で確かめる、としている。プラットフォーム自身も、プレビューからのメッセージを送信元の窓で照合している（spec §14「opaque origin の文字列だけを信頼しない」） |

### プラットフォームとの通信路

| 確認項目 | 結果 |
| - | - |
| 入れ子の枠が、Host へ直接メッセージを送る（プレビューからの通知と同じ形） | Host には届くが、送信元の窓がプレビューの枠ではないので、照合で捨てられる（`runtimes/browser/preview-host.ts` の `e.source !== this.element.contentWindow`）。観測ログに出ない |
| 入れ子の枠が、画面へ、Host からの指示（別の画面を描く）と同じ形のメッセージを送る | プレビューのスクリプトは、送信元の窓が親（Host）ではないので捨てる。画面は変わらない。教材アプリの受け取りの記録には、形の合わないメッセージとして 1 件残る |
| 教材アプリが受け取るメッセージに、Host からの指示と応答が混ざるか | 混ざる（同じ `message` イベントに届く）。教材アプリの画面は、送信元の窓が親のものを先に除く。除いたものは、交換点にも観測ログにも渡さない |
| localhost 以外への通信 | 0 件（E2E の共通フィクスチャで遮断・検査） |

### 観測

| 確認項目 | 結果 |
| - | - |
| 届いたメッセージ・送り主・結果を観測ログに出せるか | 出せる。画面が、届いたメッセージの中身（JSON の文字列）・送り主の窓（部品・広告・そのほか）・`event.origin`・受け入れたかを、観測イベント `message.received` として記録する。既存の `ViewContext.emit` で足りた |
| 学習者の操作での再現の判定 | 描画を終えたあとに届いたメッセージの観測イベントも、やり取りとして Host に届く。`detect` の条件（画面の観測イベント）で再現を判定できた |
| 自動テスト | テストの手順はボタンを押せないので、画面の経路に `?press=picker`・`?press=ad` を付けると、その枠が開いた直後にメッセージを 1 回送るようにした。画面は、そのメッセージの扱い（書き込みまで）が終わってから描画を終える |

## 新しさ（課題として独立させる価値）

- 既存の課題にない仕組みを扱う。保存型 XSS は「データがコードになる」、この課題は「だれが送ったか分からないメッセージを信じる」。対策も別（文字として出す／送り主を確かめる）。
- 実行環境の追加は小さい。プレビューの CSP に `frame-src 'self'` を足し、プレビューのスクリプトに埋め込みページの入口を足しただけで、Host 側（`preview-host.ts`）は変えていない。
- sandbox の中ではオリジンが `"null"` になることを、欠点ではなく題材にできた。「`"null"` かを確かめる」は、sandbox の iframe を使うコードで実際に書かれる足りない直し方で、学習者が観測ログの値を見て、足りない理由を自分で確かめられる。

## 残る制約

- 期待するオリジン（`https://…`）との比べ方は、手で試せない。どの配信元でも同じ 1 つのオリジンで配るので、本物の別サイトを用意できない。
- `frame-src 'self'` で、教材アプリの画面は、配信元のほかの文書（学習UI の `index.html` など）も枠に開けるようになる。開いた文書は sandbox を引き継いで不透明なオリジンになり、Host の保存領域と DOM には届かない。自由入力の HTML から `iframe` を作る道は、既存の遷移ガード（許可した要素だけを残す）が塞いでいる。
- 検証用の見えない教材アプリにも、最後に検証した画面の枠が残る（次の描画か破棄まで）。学習者の操作は届かない。

## 実装への反映

- `runtimes/browser`：`AppModule.embeds`（埋め込みページ）、`ViewContext.embedSrc`（その URL）、`embed.ts`（`#` 以降の組み立てと読み取り）、プレビューの CSP の `frame-src 'self'`。
- `apps/memo`（1.4.0）：「スタンプを送る」画面（`stamp-view.ts`）、交換点 `stamp.message.accept`、観測イベント `message.received`。
- `missions/postmessage-origin`：課題パック。
