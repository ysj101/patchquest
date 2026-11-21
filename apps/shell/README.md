# apps/shell

教材アプリ「擬似シェル」。ブラウザ内のターミナルで、架空の機械の設定（第一弾は sudo）を調べて直す課題の土台。安全な基準実装（状態 S）を不変のまま保持し、課題パックはフックの実装だけを切り替える（spec §6）。

bash を動かすのではなく、固定のコマンド集合を機械の状態（SQLite）に対して解釈する。任意のコードは実行せず、同じ seed と同じ入力の列からは同じ出力と状態になる。本物の OS 権限は再現せず、sudo の判断をモデルで表す（spec §14）。現実に転用できる権限昇格の手口は置かない。

| ファイル | 内容 |
| - | - |
| `server.ts` | 教材ロジック。`GET /sh`（プロンプトの表示に使う利用者・ホスト名・ホーム）、`POST /sh`（コマンド行 1 つの実行）。主体はセッションから解決する。`su` は使えず、利用者は演習画面で切り替える（その場所を案内する） |
| `shell.ts` | コマンド行の分解と共通の型。パイプ・リダイレクト・変数・ワイルドカードは理由を示して断る |
| `exec.ts` | コマンドの登録簿と実行。登録簿にないものは、初期データが置いた架空のプログラムだけを実行する |
| `commands.ts` | 調べるコマンド（`whoami`・`id`・`pwd`・`cd`・`ls`・`cat`） |
| `visudo.ts` | sudo の設定を書き換えるエディタ（`visudo [-f ファイル]`）。本物と同じく root だけが使え（`sudo visudo -f …`）、保存の前に構文を確かめて、読めない内容では保存しない |
| `sudo.ts`・`sudoers.ts` | sudo のモデル。`/etc/sudoers` と `/etc/sudoers.d/` の中身を毎回読み、当てはまる設定のうち最後のもので決める |
| `hooks.ts` | 交換点と基準実装。`shell.sudoers.provision`（配備時に運用担当へ許可するコマンド。初期データ生成器が呼ぶ。契約 1） |
| `fixtures.ts` | seed から架空の機械（ホスト名・運用担当と管理者の名前・プログラム名・ファイル）を作る `shell.default` |
| `tests.ts` | アプリ共通のテスト。基準実装ではすべて通る |
| `scenario.ts` | テスト・攻撃の成立条件・修正の記録を書くための部品（`sh`・`saveWithVisudo`・`ranAsRoot`・`STATE_CHANGING_COMMAND` など）。課題パックからも使う |
| `events.ts` | 観測イベントとやり取りの表示。観測ログと「加えた変更」に、HTTP の形ではなく端末の言葉（コマンド行・終了コード・端末の出力）で示す |
| `view.ts`・`editor-view.ts` | 隔離 iframe 内のターミナルと、その中に開く編集画面。出力は textContent、編集する内容は入力欄の値として扱う |

## やり取りの形

1 コマンド＝1 交換。カレントディレクトリは機械の状態に持たず、要求に載せる。修正の記録（`repair: record`）だけを再生しても、相対パスが同じ場所を指すようにするため。

```ts
// 要求（cwd を省くとホームから始める）
{ method: 'POST', path: '/sh', body: { line: 'sudo -l', cwd: '/home/sato' } }
// 応答（コマンドを解釈できたら status は常に 200。成否は exit で見る）
{ stdout: '…', stderr: '', exit: 0, cwd: '/home/sato', changed: false }
```

`changed` は、機械の状態（ファイルの内容）を変えたときだけ `true` になる。状態を変えるコマンドは `visudo` だけ。

### エディタ（visudo）

エディタは対話的に見えるが、やり取りは「開く」と「保存する」の 2 回で、どちらも同じコマンド行を送る。保存のやり取りだけで何をどう変えたかが分かるので、修正の記録（`repair: record`）にはこの 1 回が残り、そのまま再生できる。

```ts
// 開く：保存する内容を付けずに送ると、ファイルの中身が返る（状態は変えない）。端末の画面は、これを受けて編集画面を出す
{ method: 'POST', path: '/sh', body: { line: 'sudo visudo -f /etc/sudoers.d/operators', cwd: '/home/sato' } }
// → { stdout: '', stderr: '', exit: 0, cwd: '/home/sato', changed: false, editor: { path: '/etc/sudoers.d/operators', lines: ['…', '…'] } }

// 保存する：同じコマンド行に、書き換えた行（行番号は 1 から）を付けて送る
{ method: 'POST', path: '/sh', body: { line: 'sudo visudo -f /etc/sudoers.d/operators', cwd: '/home/sato', edits: [{ line: 3, text: '# …' }] } }
// → { stdout: 'visudo: … の 3 行目を保存しました', stderr: '', exit: 0, cwd: '/home/sato', changed: true }
```

- 書き換えられるのは、すでにある行の内容だけ。行を足す・消すことはできない（無効にするときは、行の先頭に `#` を付けてコメントにする）。
- 構文を読めない内容は保存せず、`exit` が 0 以外になる。編集画面は開いたまま理由を示す。
- 同じ内容での保存は `changed: false`（`visudo: … unchanged`）。
- `edits` は `visudo` のコマンド行にだけ付けられる。ほかのコマンド行に付けると 400 を返す。
- テストや検証データでは、`scenario.ts` の `visudoSave`・`saveWithVisudo` で保存の要求を書く。

利用者キーは `operator`（運用担当）と `admin`（管理者）。ログイン名は seed で変わるので、テストでは `{{accounts.operator.name}}` などの fixture の値で参照する。

観測イベント：`sudo.decision`（sudo の判断と理由）、`shell.exec`（架空のプログラムの実行と、実行した権限）、`file.changed`（ファイルの変更。`lines` に書き換えた行番号）、`app.error`（例外）。
