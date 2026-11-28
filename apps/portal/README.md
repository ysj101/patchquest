# apps/portal

教材アプリ「社内ポータル」。お知らせの一覧と、サインインを持つ。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

画面は、隔離 iframe に描くのではなく、**Service Worker が返す本物の HTTP 応答**として出す（`http: true`、必要機能 `http`。spec §14）。`handle` は、どのリクエストにも、ヘッダと HTML を本文にした応答（`runtimes/browser/http/mount.ts` の `HttpBody`）を返す。ブラウザは、その応答のステータスとヘッダに実際に従う（302 なら `Location` へ移動する）。画面はリンクとフォームだけで動き、文書の中でスクリプトは動かない。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック。`GET /`（お知らせの一覧）、`GET /notices/{番号}`（お知らせ。サインインしていなければ `/login?next=…` へ 302）、`GET /login`（サインインの画面）、`POST /login`（サインインして、行き先へ 302）、`POST /logout` |
| `pages.ts` | サーバが描く画面（HTML の文字列）。値は `apps/shared/html.ts` の `esc` を通して、文字として入れる |
| `hooks.ts` | 交換点と基準実装。`portal.signin.redirect`（サインインのあとの行き先を決める。行き先を URL として読み、このサイトの中のときだけ従う）。契約 1 |
| `fixtures.ts` | seed から、お知らせの番号と並びを作る `portal.default`。利用者（bob・alice）は、はじめはサインインしていない |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `events.ts` | 観測ログでの表示。やり取りを、リクエスト・応答のステータスとヘッダ・本文（HTML）に分けて示す |

観測イベント：`portal.redirect`（302 の行き先と、それがこのサイトの外か。外かどうかは、ブラウザと同じ URL の解析で決める）。

## 作りものの部分

- **だれの操作か**は、Cookie ではなく、演習ハーネスが発行したセッション（演習画面の「表示する利用者」）で決まる。Service Worker が作る応答では `Set-Cookie` が効かず、Cookie を受け取ることもできないため（[docs/poc/service-worker-http.md](../../docs/poc/service-worker-http.md)）。サインインしているかは、利用者ごとにデータベースに持つ。
- **サインインにパスワードはない。** 画面にも、省いていることを書いている。
- **サイトのアドレス**（`https://portal.example`）は教材の設定で、実際の配信元ではない。行き先がこのサイトの中か外かは、このアドレスを基準に決める。配信の側は、アプリの中のパス（`/notices/3`）への `Location` に、実際の置き場所（`…/assets/http/<インスタンス>/`）を前に付ける（リバースプロキシが `Location` を書き換えるのと同じ）。外のサイトを指す `Location` は書き換えない。
