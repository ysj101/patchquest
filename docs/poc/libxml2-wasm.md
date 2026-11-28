# PoC: Web Worker 上の libxml2（WASM）で XXE を再現する

Issue #239。XML の取り込みで別のファイルが混ざること（XXE、CWE-611）を題材にするために、本物の XML のパーサー libxml2 をブラウザの中で動かし、外部実体の読み込みを、メモリ内のファイルだけで再現できるかを確かめた。

## 結論

**採用する。** npm の `libxml2-wasm` 0.7.2（中身は libxml2 2.15.1）を、教材ロジックの Worker の中で使う。

- 外部実体が指す資源は、libxml2 の入力の仕組み（`xmlRegisterInputCallbacks`。`libxml2-wasm` では `xmlRegisterInputProvider`）につないだ読み手からだけ渡せる。WASM のビルドに、ファイルシステムをつなぐ作業は要らなかった。
- `XML_PARSE_NOENT` を付けると外部実体を読み、`XML_PARSE_NO_XXE` を足すと読まない。どちらも、載せた版で実測した。
- WASM はスクリプトに埋め込まれていて、読み込みに通信が要らない。通信の API を塞いだ Worker の中でも解析できる。
- 1 つだけ、ビルドの変更が要った。`libxml2-wasm` を Worker のバンドルに 1 つのファイルとしてまとめると、初期化が終わらない（下の「注意点」）。libxml2 だけを別のファイル（`assets/libxml2.js`）に分けた。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2、macOS 27.2.1 |
| ブラウザ | Google Chrome 158.0.8127.37（Playwright の `channel: 'chrome'` で起動） |
| Node.js | 24.19.0（ユニットテスト） |
| 静的サーバ | Python 3.15.0 `http.server`（`--bind 127.0.0.1`） |
| パーサー | `libxml2-wasm` 0.7.2（libxml2 2.15.1） |
| 再現手順 | Node：`pnpm exec vitest run tests/unit/xml.test.ts missions/xxe`。ブラウザ：`node scripts/build.mjs --test` のあと `pnpm exec playwright test missions/xxe --project chrome` |

## 載せる配布物

| 確認項目 | 結果 |
| - | - |
| 実在と版 | npm に `libxml2-wasm` がある。最新は 0.7.2（2026-09-07 公開）。0.1.0（2023-11）から 11 回公開されている |
| 保守の状況 | リポジトリ <https://github.com/jameslan/libxml2-wasm> は保管（archive）されておらず、最後の push は 2026-10-05。保守者は 1 人（npm の maintainers は `jameslan` だけ）。スターは 55 |
| 中身の libxml2 | リポジトリの v0.7.2 のタグは、サブモジュール `libxml2` として <https://github.com/jameslan/libxml2> のコミット `f52e859` を指す。その `VERSION` は `2.15.1`。上流（GNOME/libxml2）に、Windows 形式のパスの扱いを実行時に切り替える変更を足したフォーク |
| ライセンス | ラッパーは MIT（`LICENSE`）。libxml2 も MIT（`LICENSE.libxml2`。パッケージに同梱）。どちらも、複製に著作権表示と許諾の文を含めることを求める |
| 依存 | 実行時の依存はない（`dependencies` なし）。インストールスクリプトもない |
| 大きさ | パッケージの `lib/libxml2raw.mjs`（WASM を埋め込んだスクリプト）は 963KB。ビルド後の `assets/libxml2.js` は 1,344KB（gzip で 453KB）。別に、分けたファイルどうしが共有する `assets/runtime-shared-*.js` が 0.4KB。`assets/runtime-worker.js` は 788KB から 824KB になった（課題パックの分を含む） |
| 読み込みの時間 | Node で `import('libxml2-wasm')` が 37ms。Chrome で、Worker を作ってから初期データの準備が終わるまで（SQLite と libxml2 の読み込みを含む）が 98〜236ms（5 回） |

保守者が 1 人で、利用も多くはない。それでも採用したのは、次の理由による。

- 中身は libxml2 そのもので、ラッパーは薄い（オプションは libxml2 の `xmlParserOption` と同じ名前・同じ値）。教材で使うのは、文字列からの解析・要素の名前と中の文字・入力の読み手の登録だけである。
- 取得するのは版を固定した 1 つのパッケージで、実行時の依存とインストールスクリプトがない。
- パーサーの挙動を自分で模型として書くと、どのオプションで外部実体を読むかが実物と食い違っても気づけない。本物を載せるほうが、教材の誤りが少ない。

保守が止まったときは、同じ libxml2 を Emscripten で自分でビルドすることになる（`libxml2-wasm` の `package.json` に、ビルドの手順がスクリプトとして残っている）。

## 結果

### 外部実体を、メモリ内のファイルで再現できるか

読み手（`match`・`open`・`read`・`close`）を 1 つ登録し、解析の途中に求められた資源をすべて受ける。文書は文字列で渡し、場所（`url`）を `file:///srv/memo/uploads/import.xml` と指定した。

| 実体の宣言の `SYSTEM` | 読み手に求められた URI | 結果 |
| - | - | - |
| `file:///srv/memo/.env` | `file:///srv/memo/.env` | 読み手が返した中身に置き換わる |
| `/srv/memo/.env`（場所だけ） | `file:///srv/memo/.env` | 同じ。文書の場所を基準に、`file:` の URI になる |
| `../.env`（文書の置き場からたどる） | `file:///srv/memo/.env` | 同じ |
| 読み手が持たない場所 | その URI | 開けなかったと扱われ、中身は空になる。解析は成功する |
| 文書そのもの（`url` と同じ場所） | その URI | 読み手が返さないかぎり、開けない。文字列で渡した文書は、読み手を通らない |

- 読み手が返さないものは、パーサーに渡らない。実物のファイルシステムやネットワークへは届かない（読み手がすべての資源を受けるので、libxml2 が自分でファイルを開きに行く経路を通らない）。
- 読み手の `read` が渡したバイト数を数えると、ファイルの大きさと一致した（例：12 バイトのファイルで 12）。観測ログには、この実測を出す。

### オプション

`<!ENTITY file SYSTEM "…">` と `<!ENTITY sign "田中より">` を宣言し、本文で両方を使う文書を解析した。

| オプション | 外部実体（`&file;`） | 文書の中で決めた実体（`&sign;`） |
| - | - | - |
| なし（0） | 読まない。中身は空 | 要素の中の文字（`xmlNodeGetContent`）では「田中より」になる |
| `XML_PARSE_NOENT` | **読む。** 中身に置き換わる | 置き換わる |
| `XML_PARSE_NOENT \| XML_PARSE_NO_XXE` | 読まない。資源を求めない | 置き換わる |
| `XML_PARSE_NO_XXE` | 読まない | 「田中より」になる |
| `XML_PARSE_NOENT \| XML_PARSE_NONET` | **読む**（`file:` と場所だけの指定）。`http://` で始まる場所は、読み手に求める前に `Attempt to load network entity` で断る | 置き換わる |

- `XML_PARSE_NO_XXE` は、載せた 2.15.1 にある。`libxml2-wasm` の `ParseOption.XML_PARSE_NO_XXE`（値は `1 << 23`）として使える。
- `XML_PARSE_NOENT` は、名前に反して「実体を置き換える」オプションである。`libxml2-wasm` の型定義の説明にも、外部実体の読み込みを有効にするので危険だと書いてある。
- この版は、オプションを何も付けなければ外部実体を読まない。課題の脆弱な実装は `XML_PARSE_NOENT` を付けたもの、正しい対策は `XML_PARSE_NO_XXE` を足したものにした。`XML_PARSE_NOENT` を外す直し方も合格することを、検証データ（`missions/xxe/__tests__/verification.ts`）で確かめる。
- パラメーター実体（`<!ENTITY % file SYSTEM "…"> %file;`）は、`XML_PARSE_NOENT` で資源を読む（中身が DTD として正しくないので、解析は失敗する）。`XML_PARSE_NO_XXE` を足すと読まない。外部の DTD（`<!DOCTYPE memos SYSTEM "…">`）は、`XML_PARSE_NOENT` だけでは読まない。

### 隔離

| 確認項目 | 結果 |
| - | - |
| 読み込みに通信が要るか | 要らない。WASM は `libxml2.js` に埋め込まれている。Worker は、最初の準備の中で `libxml2.js` を `import()` で読み込む（同じ配信元。通信の API を塞ぐ前） |
| 通信の API を塞いだあとの解析 | できる。製品ビルドの Worker（`lockdown.ts` で `fetch`・`XMLHttpRequest`・`WebSocket`・`importScripts` などを塞いだあと）で、開始前の事前検証と演習中の取り込みが、外部実体の読み込みを含めて動いた |
| 外部への通信 | 課題を最初から「解決」まで解く間、配信元（localhost）以外への要求はなかった（Playwright で要求を記録） |
| 読める資源 | 初期データが seed から作る、メモリ内のファイル（教材アプリの DB の `server_files`）だけ |
| 入力で止まらないか | 実体を何重にも重ねてふくらませる XML は、libxml2 が `Maximum entity amplification factor exceeded` で断る（1ms 未満）。実体の循環は `Detected an entity reference loop` で断る。取り込む XML は 4,000 文字までに制限する |

### 決定的な合否

- サーバの中のファイルの中身（サーバの名前とパスワード）は、seed から作る。同じ seed なら同じ値、違う seed なら違う値になる。
- 合否は、応答にその値が混ざったかと、パーサーへ渡したバイト数（観測イベント `xml.parse` の `loadedBytes`）が 0 かで決める。選んだ対策の ID では決めない。
- 全パック共通の出荷前検証（Node。`VERIFICATION_SEEDS` の各 seed）で、基準は全件合格、注入した状態は攻撃阻止のテストだけが失敗、`XML_PARSE_NO_XXE` は全件合格、`XML_PARSE_NONET` は攻撃が残り、取り込みの停止は正常系が壊れることを確かめた。

### 対象の学習者との距離

XML・DTD・実体を知らない人に、短い補足で伝えられるかを、学習者として通して確かめた（[playtest-mission](../../.claude/skills/playtest-mission/SKILL.md)）。

- 前提の知識は、調べ方のカード 2 枚の補足（各 1〜2 文）で伝える：「`<!ENTITY 名前 "文字">` は、名前に文字を割り当てる」「`SYSTEM "場所"` は、文字の代わりに、その場所の中身を割り当てる」。DTD という語は、学習者に見せていない。
- 学習者は、ふつうの XML → 実体を使う XML → サーバのファイルを指す XML → 指す先を変えた XML の順に、自分で取り込んで結果を見る。XML を自分で書く必要はない（書くこともできる）。
- 対象のバイブコーダーが XML を扱う場面が少ない、という見立ては変わらない。持ち帰ることは「パーサーを呼ぶときのオプションを確かめる」に絞った。

## 実装への反映

- 実行エンジン（`runtimes/browser/engine.ts`）が、SQLite と同じく、準備のときにパーサーを読み込み、教材ロジックへ `ServerContext.xml` として渡す。読み込みは 1 実行環境につき 1 回（`runtimes/browser/libxml2.ts`）。
- 型と定数（`runtimes/browser/xml.ts`）は、libxml2 を読み込まないファイルに分けた。教材アプリと課題パックは、こちらだけを参照する（学習UIと隔離 iframe のバンドルに、libxml2 が入らない）。
- 解析の結果は、要素の名前・中の文字・子の要素だけの木にして返し、libxml2 の文書はその場で破棄する。
- ビルド（`scripts/build.mjs`）は、Worker と libxml2 を別のファイルに分けて出し、ライセンスの全文とソースコードの入手先を `assets/libxml2.LEGAL.txt` に書く。

## 注意点

- **1 つのファイルにまとめると、初期化が終わらない。** `libxml2-wasm` のモジュールは、互いに参照し合いながら（`nodes.mjs` と `document.mjs` など）、最上位で WASM の読み込みを待つ（top-level await）。esbuild で Worker のバンドルにまとめると、各モジュールが、遅らせて初期化する関数に包まれ、互いの初期化を待ち合ったまま止まった（エラーは出ず、Worker が準備の応答を返さない。Node でも同じバンドルで再現した）。esbuild の `splitting` を Worker のビルドにだけ使い、libxml2 を別のファイルに分けると、ブラウザがモジュールとして順に初期化するので、止まらない。
- 学習UIのページは CSP（`script-src 'self'`）で WASM のコンパイルを許していない。パーサーは Worker の中でだけ動かす（Worker には、ページの CSP は引き継がれない。SQLite の WASM と同じ）。
- 解析に失敗したときの理由は、libxml2 が出す英語の文（`Premature end of data in tag memo line 1` など）のまま示す。
- `libxml2-wasm` の入力の読み手の登録（`xmlRegisterInputProvider`）は、型定義で `@alpha` とされている。版を上げるときは、`tests/unit/xml.test.ts` で挙動を確かめる。
- 計測値は上記の端末での参考値で、性能の保証ではない。
