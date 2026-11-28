# PoC: 本物の別オリジン（localhost と 127.0.0.1）で Cookie・CSRF・CORS を扱う

Issue #233。同じ配布物を `http://127.0.0.1:<ポート>` と `http://localhost:<ポート>` の 2 つのオリジンとして開き、CSRF や CORS の設定ミスを、本物の仕組みのまま課題にできるかを確かめた。

## 結論

**いまの構成（静的サーバと、ブラウザの中の教材）では成り立たない。課題パックは作らず、見送りを勧める。**

ブラウザの側は本物として働く。Chrome は `localhost` と `127.0.0.1` を別のサイトとして扱い、`document.cookie` で付けた Cookie を、`SameSite` の指定どおりにリクエストへ付けたり外したりする。保存領域も分かれる。

成り立たないのは、受け手の側である。**「Cookie が付いて届いたか」を見て判断できるものが、配布物の中にない。**

| 受け手の候補 | 測った結果 |
| - | - |
| 静的サーバ（`python3 -m http.server`） | Cookie を受け取るが、処理を持たない。POST は 501、GET はファイルを返すだけ。`Set-Cookie` も `Access-Control-Allow-Origin` も返さない |
| Service Worker | 別サイトからの画面ごとの移動（フォームの POST）は受け取れる。しかし、リクエストの Cookie は見えない（`null`）。Chrome が Cookie を付けたかどうかを、Service Worker は知れない |
| 移動先の文書のスクリプト | `document.cookie` には、リクエストに付かなかった `SameSite=Strict` の Cookie も出る。別サイトから来たリクエストかどうかを、Cookie からは見分けられない |

このため、直す操作を `SameSite` の指定にしても、攻撃が止まったことを教材の側で確かめられない。操作ごとのトークンの照合は、受け手をスクリプトで書けば動くが、それは Cookie を使った本物のやり取りではなく、ブラウザの中の模型になる（その場合、2 つのオリジンは要らない）。CORS の設定ミスは、許可のヘッダを返すサーバがないので、題材そのものを置けない。

進めるには、下の「進める場合に決めること」のどれかを、先に人が決める必要がある。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2、macOS 27.2.1 |
| ブラウザ | Google Chrome 158.0.8127.37（Playwright から起動） |
| 静的サーバ | Python 3.15.0 `http.server`（`--bind 127.0.0.1`） |
| 再現手順 | `node scripts/build.mjs --test` のあと `npx playwright test tests/e2e/poc-origins.spec.ts --project chrome`。検証ページは `tests/pages/poc-origins.html`（スクリプトを持たない空のページ。操作はすべて E2E から行う）。Service Worker は #232 の PoC のもの（`tests/pages/poc-sw-worker.ts`）を使う |

教材アプリの役（Cookie を持つ側）を `http://127.0.0.1:<ポート>`、わなのページの役（別のサイト）を `http://localhost:<ポート>` にした。静的サーバは 1 つで、`--bind 127.0.0.1` のままで `localhost` からも開けた。リクエストに付いた Cookie は、DevTools と同じ経路（CDP の Network）で読んだ。

## 結果

### Cookie の発行

教材アプリの役のページで、`document.cookie` に 6 通りを書いた。

| 書いた Cookie | 結果 |
| - | - |
| `SameSite=Strict` | 付いた |
| `SameSite=Lax` | 付いた |
| `SameSite=None; Secure` | 付いた（http のままだが、`127.0.0.1` は安全な文脈として扱われる） |
| 指定なし | 付いた |
| `SameSite=None`（`Secure` なし） | 付かない |
| `HttpOnly` | 付かない。スクリプトからは `HttpOnly` の Cookie を作れない |

`Set-Cookie` を返せるものはない（静的サーバは返さず、Service Worker の応答では効かない。#232 の記録）。セッションの Cookie に `HttpOnly` を付ける、という実物での基本の形は再現できない。

### 別サイトからのリクエストに付く Cookie

わなのページ（`localhost`）から、教材アプリの役（`127.0.0.1`）へ送ったリクエストの `Cookie` ヘッダ。

| 送り方 | 付いた Cookie |
| - | - |
| 同じサイトの中の `fetch`（比較用） | Strict・Lax・None・指定なしのすべて |
| ページの中からの `fetch`（GET・POST、`credentials: 'include'`）、画像、枠（iframe） | None だけ |
| 画面ごとの移動（GET。スクリプトで `location.href` を変える） | Lax・None・指定なし（Strict は付かない） |
| フォームの POST（画面ごとの移動）。Cookie を付けてすぐ | None・指定なし |
| フォームの POST。Cookie を付けてから 130 秒後（手で測定。E2E には入れていない） | None だけ |

Chrome が付けなかった理由は、CDP では `SchemefulSameSiteStrict`・`SchemefulSameSiteLax`・`SchemefulSameSiteUnspecifiedTreatedAsLax` と出た。`localhost` と `127.0.0.1` は、ポートが同じでも別のサイトとして扱われている。

指定なしの Cookie は Lax として扱われるが、付けてから 2 分ほどの間は、別サイトからの POST にも付く（Chrome の既定の動き）。教材にすると、同じ操作の結果が、Cookie を付けてからの時間で変わる。

### 受け手の側から見えるもの

| 確認項目 | 結果 |
| - | - |
| 静的サーバへの POST | 501（`Unsupported method ('POST')`）。応答に `Access-Control-Allow-Origin` はない |
| 別サイトからの GET の移動先の文書の `document.cookie` | Strict を含むすべてが見える。リクエストには Strict が付いていないのに、文書からは区別できない |
| わなのページの中からの `fetch`（教材アプリの役の Service Worker のスコープの下の URL） | Service Worker を通らず、静的サーバの 404 |
| わなのページからのフォームの POST（同じスコープの下の URL） | Service Worker が受け取り、本文（`memo=changed`）も読めた。応答の文書も Service Worker が返した |
| 上の POST で Service Worker が見たリクエストの `Cookie` | `null` |
| 上の応答の文書の `document.cookie` | Strict を含むすべてが見える |

### CORS

| 確認項目 | 結果 |
| - | - |
| わなのページからの `fetch`（`credentials: 'include'`） | TypeError。サーバは 200 を返しているが、`Access-Control-Allow-Origin` がないので読めない |
| 同じ取得を `mode: 'no-cors'` で | 中身を読めない応答（opaque）になる |

Chrome は CORS を本物として強制する。しかし、許可のヘッダを返す・返さないを切り替えられるサーバがないので、「許可しすぎた設定」を置けない。Service Worker は、別オリジンのページからの取得を受け取らないので、代わりにならない。

### 隔離（spec §14）

| 確認項目 | 結果 |
| - | - |
| `localhost` のページから見える Cookie・`localStorage`・IndexedDB | `127.0.0.1` で書いたものは見えない（空） |
| `localhost` のページに `127.0.0.1` のページを枠で入れ、中の文書を読む | 読めない（`contentDocument` が `null`） |
| 製品のトップページを両方のオリジンで開く | どちらも開けた。`127.0.0.1` で `localStorage` に書いた印は `localhost` に出ず、進捗の保存先（IndexedDB の `patchquest`）はオリジンごとに別に作られた（手で測定） |
| 2 つのオリジン以外への通信 | 全テストを通して 0 件（E2E の中で、流れたリクエストのオリジンを検査） |

2 つ目のオリジンにも、プラットフォームのファイルはそのまま見える（同じ静的サーバが返すため）。保存データは分かれているので、わなのページから学習者の進捗には届かない。

手で測ったこと（E2E には入れていない）：枠の中の `127.0.0.1` の文書は、自分の `localStorage` と IndexedDB を読めた（枠の中でも、保存領域は上のページごとに分かれていなかった）。Cookie は None だけが見えた。

## Issue の「確かめること」への答え

| 項目 | 答え |
| - | - |
| Cookie をどう発行するか | `document.cookie` で付けられ、`SameSite` も効く。`HttpOnly` は付けられない |
| サーバ役 | **ない。** 静的サーバは処理を持たず、Service Worker と文書のスクリプトは、Cookie が付いて届いたかを知れない |
| 公開版の扱い | GitHub Pages はオリジンが 1 つなので、別サイトを作れない（測っていない。配信の形から決まる）。ローカル版だけの課題になり、spec §2「静的配信と localhost で同一のビルド成果物を利用」の中では、公開版に解けない課題が載る。決めるのは人 |
| Chrome の扱い | `localhost` と `127.0.0.1` の間で、`SameSite` は期待どおりに働く。http のままでよい。既定（Lax）の説明には、付けてから 2 分の例外が入る |
| 隔離 | 保存データは分かれ、外部通信は 0 件 |
| 安全 | 固定の「わなのページ」を配布物に置く形なら、任意の攻撃コードを動かす場面はない。ただし課題が成り立たないので、置いていない |

## 進める場合に決めること

どれも仕様の方針に関わるので、この PoC では決めていない。

1. **ローカル版に、処理を持つサーバを足す。** Cookie を読み、`Set-Cookie` と CORS のヘッダを返す小さなサーバを同梱すれば、CSRF・Cookie の属性・CORS のどれも本物として扱える。spec §1「アプリ用バックエンドの構築は不要」、§2「同一のビルド成果物」、§12（静的サーバだけで動く配布物）を変えることになる。公開版では解けない。
2. **ブラウザの中の模型として作る。** いまの教材アプリと同じく、Worker の中でサーバの判断を模型にし、Cookie とその送られ方も模型にする。2 つのオリジンは要らず、公開版でも動く。ただし spec §14 は「Cookie 認証までは再現しない」としており、design-mission の「独自の仕組みを作らず、広く知られている仕組みを使う」に対して、ブラウザが Cookie を付ける部分（題材の中心）が作りものになる。
3. **見送る。** Cookie を使わない題材（#232 の記録にある CSP・オープンリダイレクト・GET で状態を変える操作）を先に進める。

勧めるのは 3。1 は配布の形を変える大きな決定で、2 は題材の中心が本物でなくなる。

## 残っていること（未確認）

- **GitHub Pages での動作。** 試していない。
- **Windows・Linux の Chrome。** macOS の Chrome だけで測った。`localhost` の名前解決（IPv6 の `::1` が先に試される環境）で、`--bind 127.0.0.1` のサーバに `localhost` でつながるかは、ほかの OS では見ていない。
- **Cookie がポートをまたぐこと。** Cookie はホスト名ごとで、ポートを区別しない。教材が `127.0.0.1` に付けた Cookie は、同じ機械の別のポートで動くほかのサーバにも送られる見込みだが、測っていない。課題にする場合は、名前の付け方と消し方を決める必要がある。
- **第三者 Cookie を止める設定の Chrome。** 既定の設定だけで測った。
