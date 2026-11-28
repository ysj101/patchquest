# PoC: 演習用の機械に git と ssh-keygen を足す

Issue #230。課題「git の履歴に残った秘密の鍵」のために、演習用の機械（ブラウザの中で動く本物の Linux。[apps/shell/README.md](../../apps/shell/README.md)）に git を足せるかを確かめた。配布物の大きさ、機械の中での速さ、ライセンス、同じ seed から同じ履歴になるか、鍵が使えるかどうかを通信なしで確かめられるか、の 5 点。

## 結論

**足す。課題パック `leaked-key` を作る。** spec §14 の制約（機械にネットワークの装置を付けない・1 コマンド＝1 交換・テスト 1 件 20 秒とスイート 240 秒の上限）の中で成り立つ。

- 足すのは、git の本体（`/usr/bin/git`）・PCRE2（git が使う）・`ssh-keygen` の 3 つ。外と通信する部品（git の HTTP の部品、ssh、sshd）は足さない。
- 配布物（`linux.state.zst`）は 1.79MB 増える（10.77MB → 12.56MB）。
- 鍵でログインできるかどうかは、接続を試さず、sshd と同じ条件（`authorized_keys` にその鍵が登録されているか）で決める。学習者は `ssh-keygen -lf` の指紋を見くらべて確かめる。
- 履歴は `git fast-import` で作る。作者と日時を固定するので、同じ seed からは同じコミットの番号になる。

速さの値は、測ったときの端末がほかの作業で混んでいたので、絶対値ではなく、同じ条件で測ったほかのコマンド・ほかの課題との比で読む（下の「速さ」）。混んでいない端末での測り直しは、行っていない。

## 検証環境

| 項目 | 値 |
| - | - |
| 実施日 | 2026-11-28 |
| 端末 | Apple M2（8 コア）、macOS 27.2.1。測定の間、ほかの作業が並んで走っていて、ロードアベレージは 66〜150 だった |
| ブラウザ | Google Chrome 158.0.8127.37（Playwright の `channel` で起動） |
| Node.js | 24.19.0（ユニットテストと、機械の中でのコマンドの計測） |
| 機械 | Alpine Linux 3.24.4（x86）、v86 0.5.473。足したもの：`git-2.54.1-r0`・`pcre2-10.49-r0`・`openssh-keygen-10.3_p1-r2`（どれも Alpine Linux v3.24 の `main/x86`） |
| 再現手順 | 大きさ：`node scripts/build-machine.mjs` のあと `.machine/linux.state.zst` を見る。履歴と状態の変化：`pnpm exec vitest run tests/unit/linux-repo.test.ts`。課題の通し：`pnpm exec vitest run tests/unit/pack-verification.test.ts -t leaked-key`。速さを測ったスクリプトは、リポジトリに入れていない |

## 結果

### 配布物の増分

| 項目 | 値 |
| - | - |
| `linux.state.zst`（起動を済ませた状態。zstd 19） | 10,773,312 バイト → 12,563,148 バイト（+1,789,836 バイト、+16.6%）。機械の中のスクリプトを足したあとのビルドでは 12,573,567 バイト |
| 足したファイル（展開後） | `/usr/bin/git` 3,124,088 バイト、`libpcre2-8.so` 816,592 バイト（と `libpcre2-posix.so` 13,588 バイト）、`/usr/bin/ssh-keygen` 341,544 バイト |
| ビルドのときに取得するもの | 約 31MB → 約 35MB（`git` の apk 3.57MB、`pcre2` 0.33MB、`openssh-keygen` 0.17MB） |
| 配布物の全体（`dist/`） | 20MB |

- git のパッケージ（展開後 7.0MB）は、依存に libcurl と libexpat を挙げている。これは、パッケージに入っている HTTP の部品（`git-remote-http`・`git-http-fetch`・`git-http-push`）のためで、本体（`/usr/bin/git`）が要るのは `libpcre2-8` と `libz` だけ（実行ファイルの依存の一覧で確かめた）。本体だけを置けば、libcurl と、libcurl が使うライブラリ（brotli・c-ares・libidn2・nghttp2・libpsl・zstd）は要らない。
- `log`・`show`・`status`・`diff`・`add`・`commit`・`rm`・`branch`・`gc`・`fast-import` は、すべて本体に入っている。`git filter-branch`（シェルスクリプト）は置いていないので使えない。課題は履歴の書き換えを求めないので、足していない。
- `ssh-keygen` が要るのは `libcrypto` だけで、最小構成に入っている。

### 速さ

端末が混んでいたので（ロードアベレージ 66〜150。8 コア）、何もしないコマンド（`true`）でも 1 回 0.97 秒かかった。混んでいない端末では約 0.04 秒（[apps/shell/README.md](../../apps/shell/README.md)）なので、下の値は 20 倍ほど大きく出ている。**比**を見る。

動き続けている機械で、同じコマンド行を 8 回ずつ、順に回して実行した 2 回目以降の中央値（Node）：

| コマンド行 | 中央値 | `true` との比 |
| - | - | - |
| `true` | 0.97 秒 | 1.0 |
| `sudo -l` | 1.23 秒 | 1.3 |
| `cat runbook.txt` | 1.21 秒 | 1.2 |
| `git -C app status` | 1.03 秒 | 1.1 |
| `git -C app show HEAD` | 1.13 秒 | 1.2 |
| `git -C app log --oneline` | 1.53 秒 | 1.6 |
| `git -C app log -p` | 1.87 秒 | 1.9 |
| `git -C app show HEAD~1:deploy_key > /tmp/k; chmod 600 /tmp/k` | 1.67 秒 | 1.7 |
| `ssh-keygen -lf /tmp/k` | 1.86 秒 | 1.9 |
| `ssh-keygen -lf /home/deploy/.ssh/authorized_keys` | 1.88 秒 | 1.9 |
| `ssh-keygen -q -t ed25519 -N '' -f /tmp/n`（鍵を作る） | 2.53 秒 | 2.6 |

- git と ssh-keygen は、`true` の 1.1〜2.6 倍。`sudo -l`（1.3 倍）と同じ桁に収まる。
- 1 回目は遅いことがある（`git show HEAD` は 4.5 秒、`ssh-keygen -lf` は 3.2 秒。機械の外で測った時間）。エミュレータが、初めて通る処理を速くする前だからである。混んだ端末では、git を 7 回つないだ長いコマンド行が、1 回、時間切れになった（機械の中の上限は 3 秒、機械の外で待つ上限は 4.5 秒）。課題の手順どおりのコマンド行（学習者としての通しと、ユニットテスト）では、時間切れは起きなかった。混んでいない端末での値は測っていない。

初期データの反映（Node。3 回ずつ）：

| 項目 | 共通の機械（`linux.default`） | リポジトリを持つ機械（`linux.repo`） |
| - | - | - |
| 機械の起動と反映 | 5.2・5.6・6.4 秒 | 6.9・10.3・11.8 秒 |
| 動いている機械への置き直し | 2.2・3.1・3.1 秒 | 5.1・6.3・8.2 秒 |

- 履歴を作る分（`git init`・`git fast-import`・`git reset`・`chown` の 4 つのプログラム）だけ、反映が長くなる。置き直しで 2〜3 倍。混んでいない端末での置き直しは約 0.4 秒（同 README）なので、増える分は 1 秒前後と見積もる（測ってはいない）。
- コミットを `git add`・`git commit` で 1 つずつ作ると、プログラムを 7 つ起こす。`git fast-import` は、1 つのプログラムで履歴の全体を取り込む。

課題の開始前チェック（Chrome。製品ビルド。一覧のボタンを押してから、導入の「ミッション開始」が出るまで。3 回ずつ）：

| 課題 | 秒 |
| - | - |
| `sudo-misconfig` | 15.6・14.1・14.5 |
| `unverified-update` | 18.9・19.2・17.5 |
| `leaked-key` | 19.2・17.5・19.1 |

- `leaked-key` は、`unverified-update` と同じで、`sudo-misconfig` より 3〜4 秒長い。E2E が待つ上限（60 秒）には収まる。
- 検証（対策タブの「攻撃とふだんの使い方をテストする」。テスト 16 件）は、同じ混んだ端末で 11〜17 秒だった。テスト 1 件 20 秒・スイート 240 秒の上限に収まる。

### ライセンスと、ソースコードの案内

| 部品 | ライセンス | 対応 |
| - | - | - |
| git 2.54.1 | GPL-2.0-only（差分を作る部品 xdiff などは LGPL-2.1-or-later） | ライセンス文（`git-COPYING-note.txt`・`GPL-2.0.txt`・`git-LGPL-2.1.txt`）を同梱する。ソースコード（上流の `git-2.54.1.tar.xz` と、Alpine Linux のビルド定義）を保管場所に置く |
| PCRE2 10.49 | BSD-3-Clause（PCRE2 の例外つき） | ライセンス文（`pcre2-LICENCE.md.txt`）を同梱する |
| OpenSSH 10.3p1（ssh-keygen） | BSD ほか（パッケージの表記は `SSH-OpenSSH`） | ライセンス文（`openssh-LICENCE.txt`）を同梱する |

- 上流の `git-2.54.1.tar.xz` は、ビルド定義（`APKBUILD`。コミット `e1bb2d7f`）の `sha512sums` と一致することを確かめた。
- ライセンス文は、上流のソースから取り出した（git の `COPYING` の前書きと `LGPL-2.1`、OpenSSH の `LICENCE`、PCRE2 の `LICENCE.md`）。
- 一覧（`scripts/machine-licenses.mjs`）が実物のパッケージの情報と合っていることは、`tests/unit/machine-licenses.test.ts` が確かめる。
- **保管場所には、まだ置いていない。** 足した取得物（apk 3 つ）と git のソースコード（2 つ）を、保管場所のリリース（`machine-sources-1`）へ置く操作は、この作業の中では行えなかった（リリースの変更は、人が行う）。置くまでは、ビルドが配布元（Alpine Linux）から取得して警告を出す。同梱する案内は、git のソースコードの入手先として保管場所を挙げるので、配布の前に置く必要がある。手順は [docs/machine-sources.md](../machine-sources.md) §3。

### 同じ seed から同じ初期状態になるか

- 履歴は、初期データを反映するときに、機械の中の本物の git が作る。コミットの作者・日時・説明・中身を固定した `git fast-import` の入力を、初期データ生成器が組み立てる。
- 同じ seed で 2 回用意して、`git rev-parse HEAD` が同じ値（seed 7 で `2785f61f3c07ef5d3a5c73c691993af2183a94e0`）になることを、`tests/unit/linux-repo.test.ts` が確かめる。
- コミットの作者は管理者の名前（seed で変わる）なので、コミットの番号は seed ごとに違う。課題の文とテストは、番号を使わない（学習者は、`git log --oneline` に出た番号を使う）。
- 鍵は、機械の中では作らない。`ssh-keygen` は毎回違う鍵を作るので、教材のためだけに作った鍵を初期データに持つ（どこの機械にも登録していない）。学習者が作り直す鍵は、毎回違う。合否は、鍵の値ではなく、履歴に残った鍵の指紋が登録に残っているかで決める。

### 調べるだけの git のコマンドが、機械の状態を変えないか

`git status` と `git diff` は、調べるだけでも、作業の覚え（`.git/index`）を書き直すことがあった。初期データを置いた層と、利用者の操作の層とで、ファイルの情報（変更の時刻など）が違って見えるためである。書き直すと、調べただけのやり取りが「機械の状態を変えた」ことになり、修正の記録に残る。

| 対処 | 結果 |
| - | - |
| 何もしない | `git status`・`git diff` で `changed: true` になる |
| `GIT_OPTIONAL_LOCKS=0` | `git status` は書き直さなくなる。`git diff` は書き直す |
| `GIT_OPTIONAL_LOCKS=0` と `diff.autoRefreshIndex=false` | どちらも書き直さない。`git add`・`git commit` は、今までどおり書く |

どちらも git に元からある設定で、機械の中のシェル（`guest/run`）が環境変数で付ける。

### 鍵が使えるかどうかを、通信なしで確かめられるか

| 方法 | 判断 |
| - | - |
| 機械の中で sshd を動かし、`ssh -i 鍵 deploy@localhost` で入る | 採らない。ssh と sshd を足す必要があり、係（`guest/agent`）がコマンドごとに残ったプロセスを止めるので、sshd を動かし続ける仕組みも要る。コマンド行 1 つの上限（3 秒）に、鍵の交換が収まるかも分からない |
| `ssh-keygen -lf 秘密の鍵` と `ssh-keygen -lf authorized_keys` の指紋を見くらべる | 採る。sshd がログインを許す条件（登録された公開鍵の相方であること）を、そのまま手で確かめる操作で、実際の機械でも同じコマンドで行う |

- 秘密の鍵のファイルを、だれでも読める許可（0644）のまま `ssh-keygen -lf` に渡すと、指紋は出るが、警告（`UNPROTECTED PRIVATE KEY FILE`）も出る。`chmod 600` のあとは、警告なしで指紋が出る。調べ方のカードに `chmod 600` を入れた。
- 取り出した鍵は `/tmp` に置く。`/tmp` は、機械の状態の変化として数えない場所なので、調べただけの操作が修正の記録に残らない。
- `ssh-keygen -t ed25519 -f 名前` は、`-N ''` を付けなくても、合言葉を尋ねる文を出したあと、合言葉なしで鍵を作って終わった（標準入力が空のため）。

## 実装への反映

- 機械に足すもの：`scripts/machine-sources.mjs` の `SOURCES`（`git`・`pcre2`・`sshKeygen`）と、`scripts/build-machine.mjs`（git は本体だけを置く）。
- 初期データ `linux.repo` と交換点 `linux.deploy.authorize`：`apps/shell/linux/repo.ts`。
- 課題パック：`missions/leaked-key/`。設計で決めたことは [docs/pack-authoring.md](../pack-authoring.md) §8 の記録にある。

## 注意点

- 速さの値は、混んだ端末での参考値で、性能の保証ではない。混んでいない端末と、CI のランナーでの値は測っていない。CI では、マージ後の E2E と出荷前検証で確かめる。
- 機械に足したプログラムは、初めて動かすときが遅い。遅い端末で、コマンド行 1 つの上限（3 秒）にどれだけ近づくかは、確かめていない。
