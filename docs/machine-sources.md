# 演習用の機械の取得物：保管場所と、版を上げる手順

演習用の機械（教材アプリ「Linux 端末」。[apps/shell/README.md](../apps/shell/README.md)）は、ビルドのときに取得したバイナリから作る。取得物の保管場所と、版を上げるときの手順をまとめる。

## 1. 保管場所

取得物は、このリポジトリの GitHub のリリース [machine-sources-1](https://github.com/ysj101/patchquest/releases/tag/machine-sources-1) に置いてある。PatchQuest 本体のリリースではなく、取得物を置くためだけのもの（「最新のリリース」にはしない）。

| 取得するもの | ファイル | 配布元 |
| - | - | - |
| Alpine Linux の最小構成 | `alpine-minirootfs-3.24.4-x86.tar.gz` | Alpine Linux の `releases/x86/` |
| Linux カーネルと overlayfs のモジュール | `linux-virt-6.18.64-r0.apk` | Alpine Linux の `main/x86/` |
| sudo | `sudo-1.9.17_p2-r2.apk` | Alpine Linux の `community/x86/` |
| zlib（sudo と git が使う） | `zlib-1.4-r0.apk` | Alpine Linux の `main/x86/` |
| git（置くのは本体の `/usr/bin/git` だけ。HTTP で通信する部品と、接続を受ける部品は置かない） | `git-2.54.1-r0.apk` | Alpine Linux の `main/x86/` |
| PCRE2（git が使う） | `pcre2-10.49-r0.apk` | Alpine Linux の `main/x86/` |
| ssh-keygen（OpenSSH のうち、鍵を作る・調べる道具だけ。libcrypto は最小構成のものを使う） | `openssh-keygen-10.3_p1-r2.apk` | Alpine Linux の `main/x86/` |
| BIOS | `seabios.bin`・`vgabios.bin` | v86 のリポジトリ（コミット固定）の `bios/` |

- 一覧・版・ハッシュ（SHA-256）は `scripts/machine-sources.mjs` の `SOURCES` に固定してある。保管場所は同じファイルの `MIRROR`。
- ビルド（`scripts/build-machine.mjs`）は、`.machine/cache/` → 保管場所 → 配布元の順に探す。どこから得たものも、ハッシュが合わなければ使わない。
- 配布元を見るのは、保管場所にまだ置いていないとき（下の手順の途中）だけ。そのときは「保管場所に置いてください」という警告が出る。普段のビルドでこの警告が出たら、保管場所のリリースが消えているか、`SOURCES` と合っていない。
- Alpine Linux の配布元は、パッケージの版が上がると古い版を置かなくなることがある。保管場所にあれば、配布元から消えてもビルドできる。
- 同じリリースに、GPL・LGPL・MPL の部品に対応するソースコードも置いてある（リリースの説明に対応表がある）。

リリースを置き場所に選んだ理由：リポジトリに直接置くと、版を上げるたびに履歴が数十 MB ずつ大きくなる。Git LFS は、CI と GitHub Pages のビルドに LFS の取得を足す必要があり、容量と転送量の枠も使う。リリースの添付は、ビルドの側を取得元の URL を替えるだけで済む。

## 2. 版を上げる手順

1. **上げる版を決める。** Alpine Linux の同じ系列（いまは v3.24）で、最小構成・`linux-virt`・`sudo`・`zlib`・`git`・`pcre2`・`openssh-keygen` の新しい版を調べる。系列そのものを上げるとき（v3.25 など）は、`sudo`・`git`・`ssh-keygen` が必要とする共有ライブラリが最小構成に入っているかも確かめる（足りなければ `SOURCES` にパッケージを足す）。BIOS は、v86 の npm パッケージの版を上げたときに、同じコミットのものへ替える。
2. **`scripts/machine-sources.mjs` を書き換える。** `SOURCES` の `file`・`upstream`・`sha256` と、`MIRROR` の番号（`machine-sources-2` など）を上げる。ハッシュは、取得したファイルを `shasum -a 256` に通して求める。カーネルの版を上げたら、`scripts/build-machine.mjs` の `OVERLAY_MODULE`（モジュールのパスにカーネルの版が入っている）も替える。
3. **機械を作る。** `node scripts/build-machine.mjs` を実行する。新しいリリースはまだないので、配布元から取得した旨の警告が出る。
4. **動作を確かめる。** `pnpm run check` を通す（E2E と出荷前検証は、マージ後の CI で確かめる）。sudo や BusyBox の出力の文言が変わると、共通テスト（`apps/shell/tests.ts`）や課題パックの検証が落ちることがある。
5. **対応するソースコードを集める。** GPL・LGPL・MPL の部品（カーネル・BusyBox・apk-tools・pax-utils・alpine-baselayout・musl・ca-certificates・git・SeaBIOS）について、上流のソースと Alpine Linux のビルド定義（aports）を取得する。ビルド定義のコミットは、最小構成の `lib/apk/db/installed` の `c:` の行と、apk の `.PKGINFO` の `commit` にある。上流のソースは、ビルド定義（`APKBUILD`）の `sha512sums` と一致することを確かめる。同梱するソフトウェアの一覧（`scripts/machine-licenses.mjs` の `COMPONENTS`）の版・ライセンス・ソースコードのファイル名と、ライセンス文（`scripts/machine-licenses/`。上流のソースから取り出したもの）も合わせて直す。一覧が実物と食い違うと、`tests/unit/machine-licenses.test.ts` が落ちる。
6. **新しいリリースを作って置く。** 取得物の場所は `node scripts/build-machine.mjs --sources` が 1 行ずつ出す。

   ```sh
   gh release create machine-sources-2 --latest=false --title "演習用の機械の取得物とソースコード（machine-sources-2）" --notes-file <対応表を書いたファイル> $(node scripts/build-machine.mjs --sources) <集めたソースコード>
   ```

7. **保管場所から取得できることを確かめる。** `.machine/cache/` の中身を別の場所へ移してから `node scripts/build-machine.mjs --sources` を実行し、警告が出ないことを見る（リリースを作った直後の数十秒は、添付が 404 になることがある）。
8. **PR を出す。** `README.md`・`docs/local-readme.md`・この文書の版の記載も合わせて直す。リリースを作ってから PR を出すと、CI は保管場所から取得する。

古いリリースは消さない。過去のコミットをビルドするときに使い、すでに配布したバイナリに対応するソースコードの置き場所でもある。

## 3. 取得物を足すだけのとき

新しいパッケージを足すだけで、いまある取得物の版を変えないときは、リリースを作り直さず、いまのリリースに足す（`MIRROR` は変えない）。`SOURCES` に足し、上の手順 3〜5 を行ってから、足した取得物と、対応するソースコードを置く。

```sh
gh release upload machine-sources-1 <足した取得物> <集めたソースコード>
```

リリースの説明の対応表と、`SHA256SUMS` にも足す。置くまでは、ビルドが配布元から取得して警告を出す。同梱する案内（`assets/linux-machine.LEGAL.txt`）が挙げるソースコードは、置くまで保管場所にないので、配布（main へのマージ）の前に置く。
