# PoC: サーバ側の言語ランタイム（PHP・Python の WASM）

Issue #240。サーバ側の言語のランタイムを WASM で載せ、本物のサーバのコードと本物のファイルシステムの上で起きる脆弱性（最初の題材はパストラバーサル）を扱えるかを確かめた。PHP（WordPress Playground の PHP.wasm）と Python（Pyodide）の両方を、Chrome で動かして測った。

## 結論

**どちらの言語でも成り立つ。勧めるのは Python（Pyodide）。** ただし、進める前に人が決めることが残っているので、この PoC では製品のコード・仕様・課題パックを変えていない。

- どちらも、同梱したファイルだけで、応答ヘッダの設定なしに Worker の中で起動した（`SharedArrayBuffer` は使わない）。通信・保存の API を塞いだあとも動き、外部通信は 0 件だった。
- パスの解決・シンボリックリンク・`realpath` 相当の動きは、Python では本物の CPython とほぼ同じだった。違いは 1 つ（ファイルを通り抜ける `..`。下の「ファイルシステムの動き」）。
- 状態は、ファイルを置き直すだけで戻せる（0.4 ミリ秒）。終わらない処理は、Worker ごと破棄して作り直す（SQLite と同じ扱い）。

### 決めること

| 決めること | 勧め | 理由・もう一方の選択肢 |
| - | - | - |
| 言語 | Python（Pyodide） | 配布物が小さく（13.5 MB 対 20.3 MB 以上）、ライセンスの条件が軽い（MPL-2.0 対 GPL-2.0-or-later）。対象の学習者（AI にコードを書かせて Web アプリを作る人）が目にしやすい言語だと判断した（実測ではない）。PHP は冷起動が約 10 倍速い（0.13 秒 対 1.15 秒） |
| 同梱物のライセンスの扱い | Linux 端末（#170）と同じ扱いにそろえる | Pyodide は MPL-2.0。いまの約束（`tests/unit/machine-licenses.test.ts`）は、MPL のものも対応するソースコードをこのリポジトリのリリースに置く。同じにするなら、新しいリリースを作る作業が要る。MPL-2.0 の条件だけなら、配布元の案内でも足りる。どちらにするかと、同梱する部品の一覧を実物と照合する作業が残る |
| 取得のしかた | npm の依存 `pyodide` として足す（SQLite・v86 と同じ） | この PoC の作業環境では npm レジストリに届かず、試せなかった（下の「検証環境」）。配布元のリリース（`pyodide-core-314.0.8.tar.bz2`）をビルド時にハッシュ固定で取得する方法（演習用の機械と同じ）もある |
| 契約の広げ方 | 必要機能 `python` を足し、RuntimeAdapter は増やさない | Host と Worker のやり取りの形は変わらない（下の「契約」）。Issue の案（アダプターを分ける）にすると、実行制御と採点が、課題ごとにアダプターを選ぶ作りに変わる |

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2、macOS 27.2.1 |
| ブラウザ | Google Chrome 158.0.8127.37（Playwright の `channel: 'chrome'`、毎回新しいブラウザコンテキスト） |
| 静的サーバ | Python 3.15.0 `http.server`（`--bind 127.0.0.1`）。応答ヘッダは足していない |
| Python | Pyodide 314.0.8（CPython 3.14.2、Emscripten 5.0.3）。配布元のリリースの `pyodide-core-314.0.8.tar.bz2`（6,759,200 バイト、SHA-256 `ff3e5f9d9bc8e98ff30b99515535fc24d375994f47a978c61975d653e162ca37`） |
| PHP | PHP 8.4.27。WordPress Playground v3.1.66 のリポジトリにあるビルド済みの Web 用（`packages/php-wasm/web-builds/8-4/asyncify/`） |
| 本物との比較 | macOS の CPython 3.15.0 で、同じスクリプトを実行した。本物の PHP とは比べていない（手元にない） |

**npm レジストリに届かなかった。** 作業環境のプロキシの証明書が切れていて、`npm view`・`pnpm add` が 502 で失敗した。そのため、npm のパッケージ（`pyodide`・`@php-wasm/web`・`@php-wasm/universal`）は取得していない。Python は配布元のリリースを、PHP は配布元のリポジトリにあるビルド済みのファイルを使った。PHP は、公式の JavaScript の部品（`@php-wasm/universal`）を通さず、WASM の入口（`wasm_set_sapi_name` → `php_wasm_init` → `wasm_sapi_handle_request`）を 30 行ほどの検証用のコードから直接呼んだ。公式の部品を通したときの大きさと時間は測っていない。

## 結果

### 言語の比較

| 項目 | Python（Pyodide 314.0.8） | PHP（PHP.wasm 8.4.27） |
| - | - | - |
| 配布物 | `pyodide.asm.wasm` 9,597,892、`python_stdlib.zip` 2,545,550、`pyodide.asm.mjs` 1,250,259、`pyodide-lock.json` 119,077、`pyodide.mjs` 17,758。合計 13,530,536 バイト（13.5 MB） | `php_8_4.wasm` 19,981,542、`php_8_4.js` 271,852。合計 20,253,394 バイト（20.3 MB）。公式の JavaScript の部品は含まない（未測定） |
| gzip した大きさ（`gzip -9`） | 合計 6,325,406 バイト（WASM 3,528,889、標準ライブラリ 2,503,105） | WASM だけで 7,611,081 バイト |
| 冷起動（Worker の開始から、最初のコードを実行し終えるまで。6 回） | 1,129〜1,207 ミリ秒 | 116〜148 ミリ秒（起動 82〜103、最初のリクエスト 34〜51） |
| リクエスト 1 件 | 0.25〜0.38 ミリ秒（ファイルを 1 つ開いて返す処理を、新しい名前空間で実行。200 回の平均） | 1.3〜1.8 ミリ秒（下の確認用のスクリプト全体を 1 件として実行。50 回の平均。Python と同じ処理ではない） |
| WASM のメモリ（起動直後） | 30 MiB | 64 MiB |
| 本体のライセンス | MPL-2.0（リポジトリと `package.json` で確認） | GPL-2.0-or-later（`@php-wasm/web` の `package.json` で確認。リポジトリは GPL-2.0） |
| WASM に入っている部品 | CPython 3.14.2、libffi、hiwire、liblzma（xz）、SQLite 3.39.0、zstd 1.5.7、Emscripten 5.0.3 のライブラリ（上流のビルド定義 `Makefile.envs`・`cpython/Makefile` で確認）。**それぞれのライセンス文とは照合していない** | ビルド用のディレクトリに libxml2・OpenSSL・libcurl・SQLite・libzip・zlib・libpng・libjpeg・libwebp・libavif・libaom・libgd・libiconv・libedit・ncurses・oniguruma・ImageMagick がある。**どれが Web 用の WASM に入っているか、PHP 本体を含むそれぞれのライセンスは未確認** |
| 応答ヘッダ（COOP/COEP） | 要らない（`crossOriginIsolated` は `false`、`SharedArrayBuffer` は未定義のまま動いた） | 要らない（同じ） |
| 学習者との近さ（判断） | Flask・FastAPI・Django など、AI にコードを書かせる場面でよく出る。`os.path.join`・`os.path.realpath` は検索すれば同じものが見つかる | Web では広く使われている。`realpath()` も同じ形で教えられる |

いまの配布物（ソースマップを除く）は 15.4 MB で、そのうち演習用の機械が約 13 MB。Python を足すと約 28.9 MB になる。

### ファイルシステムの動き（Python）

公開フォルダー・非公開フォルダー・名前の似たフォルダー（`public-old`）・シンボリックリンクを作り、14 通りの名前で `os.path.join`・`normpath`・`abspath`・`realpath`・`commonpath`・`startswith`・`pathlib.Path.resolve()`・`is_relative_to`・`open` の結果を、本物の CPython（macOS）と比べた。

| 確認項目 | 結果 |
| - | - |
| `../private/secret.txt` | 同じ。つないだパスは `…/public/../private/secret.txt`、`realpath` は `…/private/secret.txt`、`open` は非公開のファイルを読む |
| 絶対パス（`/…/private/secret.txt`） | 同じ。`os.path.join` が前の部分を捨て、非公開のファイルを読む |
| 名前の似たフォルダー（`../public-old/old.txt`） | 同じ。`realpath` の結果は `startswith(公開フォルダー)` が `True`、`commonpath` での確認は `False` |
| シンボリックリンク（ファイル・フォルダー） | 同じ。`realpath` はリンク先を返し、`open` はリンク先を読む。`os.readlink`・`os.path.islink` も同じ |
| `%2f` を含む名前、ない名前、空の名前、`.` | 同じ（`FileNotFoundError`・`IsADirectoryError`） |
| **ファイルを通り抜ける `..`**（`guide.txt/../../private/secret.txt`） | **違う。** 本物は `NotADirectoryError`。Pyodide は読めてしまう（Emscripten のファイルシステムが、`..` を開く前に文字の上でたどる）。`realpath` の結果は同じ |
| 大文字と小文字（`GUIDE.TXT`） | Pyodide は `FileNotFoundError`。macOS の本物は読めた（macOS のファイルシステムが区別しないため。Linux は区別する） |

課題のテストと案内は、「ファイルを通り抜ける `..`」に頼らない形にする。

### ファイルシステムの動き（PHP）

同じ構成を PHP で作り、`realpath()`・`str_starts_with()`・`file_get_contents()` の結果を見た（WASM の上だけ。本物の PHP とは比べていない）。

| 確認項目 | 結果 |
| - | - |
| `../private/secret.txt` | `realpath()` は `…/private/secret.txt`、読める |
| 名前の似たフォルダー | `realpath()` の結果は、公開フォルダーの名前で始まる |
| シンボリックリンク（ファイル・フォルダー） | `realpath()` はリンク先を返し、リンク先を読む |
| 絶対パス | 読めない（PHP は文字列をつなぐだけなので、`公開フォルダー//…` になる。Python とは違う） |
| ない名前・ファイルを通り抜ける `..` | `realpath()` は `false` |

### 状態の作り直しと停止（Python）

| 確認項目 | 結果 |
| - | - |
| 演習ごとの作り直し | 公開フォルダー一式を消して置き直す処理は 0.41〜0.42 ミリ秒（20 回の平均）。足したファイルは消えた |
| リクエストごとの状態 | リクエストごとに新しい名前空間で実行できる（上の 0.25〜0.38 ミリ秒）。本物のサーバはリクエストをまたいでプロセスの状態を持つので、どこまで戻すかは実装で決める |
| インスタンスの分離 | 同じプロセスにランタイムを 2 つ作ると、ファイルシステムは別々だった（Node で確認）。2 つ目の起動は 1.35 秒 |
| 終わらない処理（`while True: pass`） | 外から中断できない（中断の仕組みは `SharedArrayBuffer` が要る）。Worker を `terminate()` で破棄し（0 ミリ秒）、新しい Worker が 1.1〜1.25 秒で使えるようになった |
| Worker の破棄でのメモリの解放 | 測っていない |

### 静的配信

| 確認項目 | 結果 |
| - | - |
| 同梱したファイルだけでの冷起動 | できた。取得したのは同じディレクトリの 5 つのファイルだけ（`pyodide.mjs`・`pyodide.asm.mjs`・`pyodide.asm.wasm`・`python_stdlib.zip`・`pyodide-lock.json`）。module Worker から `import()` で読める |
| 応答ヘッダ | `python3 -m http.server` のままで動いた。WASM は `application/wasm` で配信された |
| 製品の Host の CSP（`script-src 'self'` など。`platform/index.html`） | 同じ CSP を付けた検証ページから Worker を起動しても、起動と実行ができた |
| GitHub Pages | 試していない。応答ヘッダが要らないので動く見込み |

### 隔離（Python）

起動のあとに、いまの `runtimes/browser/lockdown.ts` と同じ API（`fetch`・`XMLHttpRequest`・`WebSocket`・`indexedDB` など）を塞いでから実行した。

| 確認項目 | 結果 |
| - | - |
| 塞いだあとの実行 | ファイルの操作と、まだ読んでいない標準ライブラリ（`http.server`・`email.parser`・`wsgiref.util`・`zipfile`・`tempfile`）の `import` ができた。標準ライブラリは起動のときにメモリへ展開され、あとから取得しない |
| `urllib.request.urlopen`・`socket.create_connection` | 失敗（`Host is unreachable`。ソケットがない） |
| `subprocess.run`・`os.system` | 失敗（`emscripten does not support processes`、`os.system` は `-1`） |
| Python から JavaScript の `fetch`・`XMLHttpRequest`・`indexedDB` を呼ぶ（`import js`） | 塞いだあとは失敗。**塞がないと `js.fetch` は実際に外へ要求を送った**（塞がない回で 1 件観測した） |
| `loadPyodide({ jsglobals: {} })` | Python から JavaScript の大域（`js.fetch` など）に届かなくなった。塞ぐ API とあわせて、二重に止められる |
| 外部通信 | 塞いだ 5 回と、Host の CSP を付けた 1 回で 0 件 |

実行するのは同梱したスクリプトだけにし、リクエストの値はデータとして関数の引数で渡す（文字列をコードとして実行しない）。これは実装の約束で、PoC では測っていない。

PHP も、起動のあとに同じ API を塞いだ状態で 50 回実行でき、外部通信は 0 件だった。PHP から外へ出る関数（`file_get_contents('http://…')`・`fsockopen`）は、検証用のコードが応答しなくなったので測れていない。

### Linux 端末との分担

同じ題材を、演習用の機械（Linux 端末。#158）の上の Web サーバで作る場合と比べた。機械の側は測り直さず、#158 の記録と、同梱しているソフトウェアの一覧（`scripts/machine-licenses.mjs`）を根拠にした。

| 観点 | 言語ランタイム（Python） | Linux 端末の上の Web サーバ |
| - | - | - |
| サーバのコードの言語 | Python | 機械に入っているのは BusyBox・sudo などで、Python も PHP もない。そのままではシェルスクリプトで書くことになる。言語を足すと、機械の配布物（いま 10.8 MB）が大きくなる（増える量は未測定） |
| 開始までの時間 | 冷起動 1.15 秒 | 課題の開始前チェックに約 14 秒（#158） |
| 操作 1 回 | 1 ミリ秒未満 | 0.2〜0.9 秒（#158）。検証の時間の上限を 4 倍にしている |
| ファイルシステム | Emscripten のメモリ上のもの。上の違いが 1 つある | 本物の Linux のもの |
| 画面 | 教材アプリの画面（一覧とダウンロード）を、いまのプレビューにそのまま出せる | 端末の画面。Web の画面を出すには、機械の中のサーバへの橋渡しが要る（未検討） |

サーバのコードを学習者が書く言語で見せたいこと、検証（テストを数十件、初期状態へ戻しながら実行する）が速いことから、言語ランタイムを別に載せる理由は立つと判断した。パスの解決が本物の Linux と同じであることを最優先にするなら、Linux 端末の側になる。

### 契約（RuntimeAdapter）

いまのコードを読んで確かめた。

- アダプターの指定（`manifest.runtime.adapter`）は検証で `browser` だけを受け付ける（`platform/contract/validate.ts`）。どのアダプターで動かすかを、この値で選んでいる箇所はない。
- 実行制御は演習用のアダプターを 1 つだけ持ち（`platform/ui/app.ts`）、採点は課題を知らない関数でアダプターを作る。アダプターを課題ごとに選ぶには、この 2 か所と、テスト用のページ（`tests/pages/`）を変える必要がある。
- 本物の Linux（#158）は、アダプターを増やさず、必要機能 `linux-vm` と、教材アプリの宣言（`AppModule.machine`）で足している。

言語ランタイムでも、Host と Worker のやり取り（準備・呼び出し・実装の切り替え・初期化）と、画面の隔離 iframe は変わらない。変わるのは Worker の中だけである。

## 進める場合の案

決めることが決まったあとの、設計の出発点。決定ではない。

### 実行環境

- 必要機能 `python` を足す。ランタイムの起動・ファイルの置き直し・関数の呼び出しを `runtimes/python/` に置き、`eslint.config.mjs` の `LAYERS` に足す。
- 教材アプリは、`machine` と同じ形で Python を使うことを宣言する。初期データ（SQLite の表）からファイルを置き直す処理を持ち、リクエストは同梱した Python の関数へ渡す。
- 交換する実装（脆弱な実装・対策候補）は、同梱した Python のソースとして登録する。リクエストの値をコードとして実行する経路は作らない。
- Pyodide の 5 つのファイルは、Worker と同じディレクトリに置き、通信を塞ぐ前に読む。`jsglobals` を空にして起動する。
- 仕様は、§14 に言語ランタイムの段落（Linux 端末の段落と同じ形）を足し、§11.3 の「新しい言語には新アダプターが要る」を、必要機能と Worker の側の実行環境を足す形に改める。
- 参考コードの差分（`ReferenceDiff.language`）に `python` を足し、色分け（`platform/syntax/highlight.ts`）にコメント `#` の規則を足す。

### 課題（パストラバーサル、CWE-22）

design-mission の手順 1 の下書き。

- **持ち帰ること**：ファイル名を受け取ってファイルを開くコード（`open(os.path.join(BASE, name))`）を見つけたら、開く前に `os.path.realpath()` で実際のパスに直し、それが公開フォルダーの中かを `os.path.commonpath([path, BASE]) == BASE`（または `Path.resolve().is_relative_to(BASE)`）で確かめているかを見る。`startswith` で比べていたら、名前の似たフォルダーで試す。
- **理解してもらう仕組み**：`os.path.join` は文字をつなぐだけで、`..` は開くときに 1 つ上のフォルダーとして扱われる。だから、つないだ文字列が公開フォルダーの名前で始まっていても、実際に開くファイルは外にある。開く前に実際のパスに直し、フォルダーの区切りで比べれば、外を指す名前は開く前に断れる。
- **学習者が手で見る出来事**：ファイル名を変えて送り、観測ログで「入力 → つないだパス → 実際のパス → 読んだ中身」を見くらべる。直したあとに同じ名前を送り、どのパスが公開フォルダーの外だと判断されて断られたかを見る。
- **合格しない直し方**：画面から名前の入力をなくすだけ（直接のリクエストは通る）。実際のパスを `startswith` で比べるだけ（`public-old` のような名前の似たフォルダーが通る）。`/` を含む名前をすべて断る（フォルダーの中の資料が開けなくなる）。
- **作りもの**：ファイルシステムはメモリ上のもの。リクエストを Python の関数へ渡す入れ物は教材用（実物では Flask などのフレームワークがこれに当たる）。

## 未確認

- npm のパッケージ（`pyodide`・`@php-wasm/*`）を依存として入れたときの、ビルド・型・バンドルの扱い。
- PHP の、公式の JavaScript の部品を通したときの大きさと冷起動、本物の PHP とのファイルシステムの比較、PHP から外へ出る関数の動き。
- 同梱する部品の一覧とライセンスの、実物との照合（Linux 端末で #170 が行ったもの）。
- GitHub Pages での動作、Chrome 以外のブラウザ、性能の低い端末での冷起動。
- Worker の破棄でメモリが解放されること。
- 検証用のインスタンス（演習用とは別の Worker）を含めて 2 つ動かしたときのメモリと時間。
- Linux の本物の CPython との比較（比べたのは macOS）。

## 再現手順

検証ページはリポジトリに入れていない（Pyodide の取得のしかたが決まっていないため）。次の手順で再現できる。

1. `gh release download 314.0.8 -R pyodide/pyodide -p 'pyodide-core-314.0.8.tar.bz2'` で取得し、上のハッシュを確かめて展開する。5 つのファイルを、検証ページと同じディレクトリに置く。
2. module Worker から `const { loadPyodide } = await import(new URL('pyodide.mjs', import.meta.url).href)`、`await loadPyodide({ indexURL: new URL('./', import.meta.url).href })` で起動する。起動のあとに `runtimes/browser/lockdown.ts` の一覧の API を塞ぐ。
3. `python3 -m http.server 4241 --bind 127.0.0.1` で配信し、Playwright（`channel: 'chrome'`）で新しいコンテキストから開いて、Worker の開始から応答までの時間と、配信元以外への要求を記録する。
4. ファイルシステムの確認は、次のスクリプトを Pyodide（`probe('/poc')`）と、本物の CPython（一時ディレクトリ）の両方で実行し、出力を比べる。

```python
import errno, json, os, pathlib, shutil

def build(root):
    if os.path.exists(root):
        shutil.rmtree(root)
    base = os.path.join(root, 'srv/app/public')
    os.makedirs(base)
    os.makedirs(os.path.join(root, 'srv/app/public-old'))
    os.makedirs(os.path.join(root, 'srv/app/private'))
    for rel, text in [('public/guide.txt', 'guide'), ('private/secret.txt', 'secret'), ('public-old/old.txt', 'old')]:
        with open(os.path.join(root, 'srv/app', rel), 'w') as f:
            f.write(text)
    os.symlink('../private/secret.txt', os.path.join(base, 'link.txt'))
    os.symlink(os.path.join(root, 'srv/app/private'), os.path.join(base, 'dirlink'))
    return base

def probe(root):
    base = build(root)
    names = ['guide.txt', '../private/secret.txt', os.path.join(root, 'srv/app/private/secret.txt'), '../public-old/old.txt',
             'link.txt', 'dirlink/secret.txt', './sub/../guide.txt', 'nope.txt', '..%2fprivate%2fsecret.txt',
             'guide.txt/../../private/secret.txt', '', '.', '../public/guide.txt', 'GUIDE.TXT']
    rows = []
    for name in names:
        joined = os.path.join(base, name)
        real = os.path.realpath(joined)
        row = {
            'name': name, 'joined': joined, 'normpath': os.path.normpath(joined), 'abspath': os.path.abspath(joined), 'realpath': real,
            'startswith': real.startswith(base), 'commonpath': os.path.commonpath([real, base]) == base,
            'pathlib': str(pathlib.Path(joined).resolve()), 'is_relative_to': pathlib.Path(joined).resolve().is_relative_to(base),
            'islink': os.path.islink(joined),
        }
        try:
            with open(joined) as f:
                row['read'] = f.read()
        except OSError as e:
            row['error'] = type(e).__name__ + ':' + errno.errorcode.get(e.errno, str(e.errno))
        rows.append(row)
    return json.dumps({'rows': rows, 'listdir': sorted(os.listdir(base)), 'readlink': os.readlink(os.path.join(base, 'link.txt'))}).replace(root, '<R>')
```

計測値は上の端末での参考値で、性能の保証ではない。
