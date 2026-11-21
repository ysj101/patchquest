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

## Linux 端末（`linux/`）

同じ端末の画面・同じ初期データで、中身だけを本物の Linux に替えた教材アプリ（ID は `linux`）。WASM のエミュレータ（[v86](https://github.com/copy/v86)）の中で Alpine Linux を起動し、コマンド行をその中で実行する。sudo も visudo も本物が動く（spec §14、Issue #158）。擬似シェルのコードはそのまま残してあり、共通テスト（`tests.ts`）は両方で通る。

| ファイル | 内容 |
| - | - |
| `linux/index.ts` | アプリの定義。画面（`view.ts`）・初期データ（`fixtures.ts`）・テスト（`tests.ts`）・やり取りの表示は擬似シェルと共有する |
| `linux/server.ts` | 教材ロジック。要求の形は擬似シェルと同じ（`POST /sh { line, cwd?, edits? }`）で、コマンド行を機械の中で、ログインした利用者として実行する |
| `linux/provision.ts` | 初期データ（SQLite の表）を機械へ反映するスクリプトを組み立てる。利用者・ファイル・プログラム・sudo の設定を置く |
| `linux/events.ts` | 機械の中の記録（プログラムの実行・sudo の記録・変わったファイル）を観測イベントにする |
| `linux/hooks.ts` | 交換点 `linux.sudoers.provision`（処理の形は `shell.sudoers.provision` と同じ。契約 1） |
| `linux/guest/` | 機械の中で動くシェルスクリプト。`init`（起動）、`agent`（要求を受ける係）、`run`（利用者としてコマンド行を実行）、`editor`（visudo が呼ぶエディタ） |

機械の配布物（エミュレータ・BIOS・起動を済ませた状態）は `scripts/build-machine.mjs` が `.machine/` に作る。Alpine Linux の最小構成・sudo・カーネルを、版とハッシュを固定して取得する。ビルド（`pnpm run build`）とユニットテストの前に、必要なら自動で作る。機械を動かす部品は `runtimes/browser/machine.ts`。

### 機械の中の仕組み

- 機械とは、シリアル回線で 1 行の要求と 1 行の応答をやり取りする（`guest/agent` の冒頭に形を書いてある）。ネットワークの装置は付けていない。
- ファイルシステムは 3 層の重ね合わせ（overlayfs）にする。下から、起動したときの `/`、初期データ、利用者の操作。利用者のコマンドは、重ね合わせた場所を `/` として実行する。初期状態へ戻すときは、利用者の操作の層を捨てる（テストごとのリセットが 0.2 秒ほどで済む）。
- `changed` は、利用者の操作の層にあるもののうち、初期状態と中身・所有者・許可が違うものが、コマンドの前後で変わったときに `true` になる。見るのは `/etc`・`/home`・`/root`・`/usr/local`・`/opt`・`/srv`・`/var/log`。`/tmp` などの変化は数えない。
- `shell.exec` は、初期データが置いたプログラムが root だけが書ける記録に残したものから作る。`sudo.decision` は、本物の sudo の記録（`logfile`）から作る。`file.changed` はパスだけを持つ（どの行かは分からない）。
- `/etc/sudoers` の末尾に、この機械のための設定を足す（パスワードを尋ねない・sudo の記録を取る・`/etc/sudoers.d` を読む）。`sudo -l` には、この設定も表示される。
- visudo の編集は、擬似シェルと同じ編集画面で行う。開くときは `guest/editor` が中身を画面へ渡し、保存するときは書き換えた行を当てはめる。構文は本物の visudo が確かめ、読めない内容は保存しない。

### 擬似シェルとの違い

- パイプ・リダイレクト・`grep` など、機械に入っているものは何でも使える。`help` は本物のシェルの組み込みコマンドになる。
- コマンド行 1 つは 3 秒で止める。画面を持つプログラム（`vi` など）は入力を受け取れない。
- 起動直後は動きが遅い（エミュレータが、よく通る処理から順に速くしていく）。課題の開始前チェックに十数秒かかる。
- コマンドの出力は本物のもの（英語のエラー文、`sudo -l` の `Matching Defaults entries` など）。
