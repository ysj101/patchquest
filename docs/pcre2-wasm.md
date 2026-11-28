# 正規表現エンジン PCRE2（WASM）：置き場所と、作り直す手順

教材アプリ「メモ帳」の表示名の入力チェックは、正規表現エンジン PCRE2 で照合する（[apps/memo/README.md](../apps/memo/README.md)）。PCRE2 は、公式のソースから WebAssembly にビルドしたものを、リポジトリに入れてある。採用の根拠と実測は [docs/poc/pcre2-wasm.md](poc/pcre2-wasm.md)。

## 1. 置き場所

| ファイル | 内容 |
| - | - |
| `vendor/pcre2/pcre2.wasm` | ビルドした PCRE2。配布物の `assets/pcre2.wasm` になる |
| `vendor/pcre2/LICENCE.md` | PCRE2 のソースに入っているライセンス文の写し（BSD-3-Clause WITH PCRE2-exception） |
| `scripts/pcre2-source.mjs` | 元になるソースの版・URL・ハッシュ、`pcre2.wasm` のハッシュ、配布物に添える表示（`assets/pcre2.LEGAL.txt`） |
| `scripts/build-pcre2.mjs` | ビルドの手順（`pnpm run build:pcre2`） |
| `scripts/pcre2/wrapper.c` | PatchQuest が PCRE2 を呼ぶための入口。JavaScript 側（`runtimes/browser/regex.ts`）は、ここで公開する関数だけを使う |
| `scripts/pcre2/libc.c`・`scripts/pcre2/include/` | PCRE2 が使う標準ライブラリの関数だけを持つ、最小の実装。モジュールが外の関数（import）を要らないようにする |

- ふだんのビルド（`node scripts/build.mjs`）とテストは、PCRE2 をビルドしない。リポジトリにある `pcre2.wasm` をそのまま使う。
- `pcre2.wasm` が記録したハッシュと合わないと、`tests/unit/pcre2-source.test.ts` が落ちる。
- 入れているのは 8 ビットのライブラリだけ。Unicode の表（`SUPPORT_UNICODE`）と JIT は入れていない。

リポジトリに出来上がりを入れた理由：ビルドには wasm32 向けの clang とリンカが要る。CI と、ビルドするすべての人の環境にそれを求めるより、100KB のファイルを 1 つ入れるほうが軽い。演習用の機械の取得物（数十 MB。[docs/machine-sources.md](machine-sources.md)）と違い、履歴はほとんど大きくならない。

## 2. 作り直す手順

PCRE2 の版を上げるとき・入口（`scripts/pcre2/`）を変えるときに行う。

1. **道具を用意する。** wasm32 向けに出力できる clang と、WebAssembly のリンカ（`wasm-ld`）。PATH からは探さないので、場所を環境変数で渡す。

   ```sh
   export PQ_CLANG=/usr/bin/clang
   export PQ_WASM_LD="$(rustc --print sysroot)/lib/rustlib/$(rustc -vV | sed -n 's/^host: //p')/bin/gcc-ld/wasm-ld"
   ```

   clang が wasm32 に対応しているかは `clang --print-targets | grep wasm32` で分かる。リンカは、LLVM の `wasm-ld` でも、Rust に付いてくるもの（上の例）でもよい。
2. **版を上げるときは、`scripts/pcre2-source.mjs` の `PCRE2_SOURCE` を書き換える。** `version`・`file`・`url` と、`sha256`（取得したファイルを `shasum -a 256` に通した値。GitHub のリリースの画面に出るハッシュと見くらべる）。PCRE2 の `NON-AUTOTOOLS-BUILD` を読み、コンパイルするソースの一覧が変わっていたら、`scripts/build-pcre2.mjs` の `MODULES` も合わせる。
3. **ビルドする。** `pnpm run build:pcre2`。ソースを取得してハッシュを確かめ、`.pcre2/` で作業し、`vendor/pcre2/` に `pcre2.wasm` と `LICENCE.md` を置く。最後に、出来上がりのハッシュを出す。
4. **`scripts/pcre2-source.mjs` の `PCRE2_WASM_SHA256` を、出たハッシュに書き換える。**
5. **確かめる。** `pnpm run check` を通す。照合の回数（`tests/unit/regex.test.ts`）や、課題の検証（`missions/redos/__tests__/redos.test.ts`）が落ちたら、PCRE2 の最適化が変わって、回数や打ち切りの境目が動いている。課題パックの案内文に書いた回数（`missions/redos/learning.ts`）と、打ち切られる入力の長さを測り直す。
6. **PR を出す。** `README.md`・`docs/local-readme.md` の版の記載も合わせて直す。PR には、ビルドに使った clang とリンカの版を書く。
