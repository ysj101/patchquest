# PoC: Service Worker で本物の HTTP 応答を返す

Issue #232。Service Worker をサーバ役にして、教材アプリへのリクエストに本物の HTTP 応答（ステータス・ヘッダ・本文）を返せるか、プラットフォームの隔離の約束（spec §14）と両立するかを確かめた。

## 結論

**条件つきで成り立つ。** 次の構成なら、隔離を保ったまま、Chrome が応答ヘッダを本物として扱う。

1. Service Worker は、教材アプリ用のスコープの下の URL だけを受け持つ。学習UI（Host）のページはスコープの外に置く。
2. 教材アプリは、sandbox 属性を付けない枠（iframe）で開く。代わりに、Service Worker が**すべての文書の応答**に `Content-Security-Policy: sandbox allow-scripts allow-forms` を付ける。文書は不透明なオリジンになり、Host の保存領域と DOM に届かない。
3. 教材アプリは、リンクとフォームで動く、サーバが描くページにする。隔離した文書からの `fetch` と、外部ファイルのスクリプトの読み込みは Service Worker に届かない。スクリプトは文書に埋め込む。
4. 教材ロジックと状態は Service Worker に置かない。Service Worker は止まるとメモリを失うので、リクエストごとに Host へ問い合わせ、Host が既存の Worker（`runtimes/browser/worker.ts`）へ渡す。Service Worker は、返ってきた中身を HTTP 応答の形にするだけにする。

扱えない題材もはっきりした。**Cookie を使う題材と、ブラウザの HTTP キャッシュを使う題材は、この方式では作れない。**

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2、macOS 27.2.1 |
| ブラウザ | Google Chrome 158.0.8127.37 |
| 静的サーバ | Python 3.15.0 `http.server`（`--bind 127.0.0.1`） |
| 再現手順 | `node scripts/build.mjs --test` のあと `npx playwright test tests/e2e/poc-sw.spec.ts --project chrome`。検証ページは `tests/pages/poc-sw.html`・`poc-sw.ts`、Service Worker は `tests/pages/poc-sw-worker.ts` |

検証ページ（Host）は `/test/poc-sw.html`、Service Worker のスコープは `/test/poc-sw/`。スコープの下の URL を `<インスタンス>/<経路>` として受け、応答に付けるヘッダは検証ページが指定する。枠の中の文書は、自分から見えたものを Host へ知らせる。

## 結果

### 本物の HTTP 応答として扱われる範囲

| 確認項目 | 結果 |
| - | - |
| ステータスとヘッダの見え方 | DevTools と同じ経路（CDP の Network）で、ステータス 200・`fromServiceWorker: true`・付けたヘッダ（`cache-control` など）がそのまま見えた |
| `Content-Security-Policy: script-src 'none'` | 文書は開くが、中のスクリプトは動かない（Chrome が強制） |
| `X-Frame-Options: DENY` | 文書は枠に出ない |
| `Content-Security-Policy: frame-ancestors 'none'` | 文書は枠に出ない |
| 302 と `Location` | ブラウザが行き先へ移動し、行き先の文書が開いた |
| フォームの POST | Service Worker が、メソッド `POST` と本文 `memo=hello` を受け取った（隔離した文書からの送信） |

### 本物にならない範囲

| 確認項目 | 結果 |
| - | - |
| 応答の `Set-Cookie` | 効かない。文書から見える Cookie は増えず、CDP で見える応答ヘッダからも消えている |
| リクエストの `Cookie` | ページが `document.cookie` で付けた Cookie は、Service Worker が受け取るリクエストのヘッダに入らない（`null`） |
| ブラウザの HTTP キャッシュ | `Cache-Control: max-age=600` を付けた応答を続けて 2 回取得しても、2 回とも Service Worker に届いた。応答はキャッシュに入らない |

### 隔離

| 構成 | 結果 |
| - | - |
| そのまま開く（sandbox なし） | 文書は Host と同じオリジンになる。Host の `localStorage` と DOM（`parent.document`）を読めた。**このままでは使えない** |
| 枠に `sandbox="allow-scripts"` を付ける（いまのプレビューと同じ） | 枠への移動は Service Worker を通らず、静的サーバの 404 になった。**この構成では Service Worker を使えない** |
| 応答に `Content-Security-Policy: sandbox allow-scripts allow-forms` を付ける | 文書は Service Worker が返し、オリジンは不透明（`null`）になった。Host の DOM・`localStorage`・Cookie・`navigator.serviceWorker` はどれも SecurityError。**採用する構成** |
| 上の構成の文書からの `fetch` | TypeError。Service Worker を通らず静的サーバへ向かい、別オリジンの取得として止まる |
| 上の構成の文書からの `<script src>` | 読み込めない（同じく Service Worker を通らず 404） |
| 上の構成の文書からのフォーム送信 | Service Worker に届き、移動先の文書も Service Worker が返した。移動先にも同じヘッダを付ければ、隔離は続く |
| Host（スコープの外）からの `fetch` | Service Worker を通らず、静的サーバの 404。学習UI 自身の通信に Service Worker は関わらない |
| localhost 以外への通信 | 全テストを通して 0 件（E2E の共通フィクスチャで遮断・検査） |

### 状態と停止

| 確認項目 | 結果 |
| - | - |
| インスタンスの分離 | URL の先頭（`a/`・`b/`）で状態を分けられた。演習用と検証用を、同じ Service Worker の別のインスタンスとして置ける見込み |
| Service Worker の停止 | CDP で止めると、メモリに置いた回数は消えた（2 まで進んだ回数が 1 に戻る）。次のリクエストで自動で起動し直した |
| Host への問い合わせ | Service Worker から Host のページへ `MessageChannel` で問い合わせ、返ってきたステータス・ヘッダ・本文で応答を作れた。停止して起動し直したあとも通った。Host はスコープの外（Service Worker が受け持たないページ）でも届く |

## 題材への影響

| 題材（Issue #232 の候補） | 判断 |
| - | - |
| セキュリティヘッダ（CSP） | 作れる。学習者が決めた CSP と、隔離用の `sandbox` の CSP は別々のヘッダとして両方が効く（#234 のポリシーの渡し方は、ヘッダで渡せる） |
| 枠に入れることの禁止（`X-Frame-Options`・`frame-ancestors`） | 強制はされる。ただし「別のサイトの枠に入れられる」場面の作り方は未確認（下の「残っていること」） |
| オープンリダイレクト、GET で状態を変える操作 | 作れる見込み。リダイレクトとフォームは本物として動く |
| キャッシュの設定ミス | **作れない。** 応答がブラウザのキャッシュに入らない。Service Worker の中にキャッシュの模型を作ることはできるが、本物ではなくなる |
| Cookie を使う題材（CSRF・Cookie の属性） | **作れない。** `Set-Cookie` も `Cookie` も使えない。別の方式（#233）でも、Cookie を発行する手段が先に要る |

## 残っていること（未確認）

- **GitHub Pages での動作。** スコープは Service Worker のファイルからの相対で決めたので、サブパスでも同じ形で登録できる見込みだが、実際の Pages では試していない。
- **Service Worker の更新と残留。** 配布物を入れ替えたあとに古い Service Worker が残る場合の扱い。PoC は `skipWaiting` と `clients.claim` で即時に切り替えただけ。
- **放置による停止。** 実際の停止（Chrome は使われていない Service Worker を止める）は待たず、CDP で止めて代えた。
- **外部への `Location`。** リダイレクトの行き先が外部だと、枠が外へ移動して通信が起きる。Service Worker の側で、スコープの外への `Location` を出さないようにする必要がある（未実装・未測定）。
- **別のサイトの枠に入れる場面。** 不透明なオリジンの文書を親にすれば別オリジンの枠として扱われる見込みだが、試していない。
- **検証用インスタンス。** 見えない枠で検証用のインスタンスを動かし、テストの時間の上限（1 件 5 秒）に収まるか。
- **学習者が DevTools を開く案内。** 画面の案内だけで開けるか。開かなくても同じ情報（ステータス・ヘッダ）を観測ログに出すか。
- **スクリプトを文書に埋め込む制約。** 教材アプリの画面のスクリプトを、応答の文書へ埋め込む作り（いまの `buildSandboxDocument` に近い）にできるか。

## 実装へ進む場合の反映

- 新しい必要機能（または RuntimeAdapter）として足す。いまのプレビュー（`sandbox` 属性の枠＋メッセージ）とは枠の作りが違うので、同じ枠は使い回せない。
- 教材アプリは、リクエストを受けて HTML を返す形（リンクとフォーム）で作る。いまの教材アプリ（画面のスクリプトが `fetch` 相当の呼び出しをする形）とは作りが違う。
- 最初の題材は、Cookie とキャッシュを使わないもの（CSP、オープンリダイレクト、GET で状態を変える操作）から選ぶ。
