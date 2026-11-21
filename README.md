# PatchQuest

ブラウザ上で動く教材アプリに、よくあるアプリケーション脆弱性を独立した課題パックとして注入する学習プラットフォームです。仕様は [docs/spec.md](docs/spec.md) を参照してください。

## 公開版を使う

インストールなしで試すには、PC版の Chrome で <https://ysj101.github.io/patchquest/> を開きます。

- ローカル版と同じビルド成果物を GitHub Pages で静的に配信しているだけで、サーバー側の処理や外部 API はありません。
- 進捗はローカル版と同じくブラウザの中（IndexedDB）にだけ保存され、利用履歴を外部に送信しません。消すときは課題一覧の「進捗をすべて削除」か、ブラウザで `ysj101.github.io` のサイトデータを削除します。
- main ブランチへの反映時に [.github/workflows/pages.yml](.github/workflows/pages.yml) が自動で配信し直します。PR ごとのプレビューはありません。
- オフラインで使う、または配信先に依存せずに手元で動かすときは、次のローカル版を使います。

## ローカル版を使う

配布用の ZIP（`pnpm run package` で `release/` に作成）を展開し、展開したフォルダで localhost 限定の静的サーバを起動して、PC版の Chrome で開きます。

```sh
python3 -m http.server 8000 --bind 127.0.0.1   # Windows は py -m http.server 8000 --bind 127.0.0.1
# ブラウザで http://127.0.0.1:8000/ を開く
```

- 動作を確認したブラウザ：Google Chrome 154（macOS）。Edge など他のブラウザは対象外です。
- `index.html` をダブルクリックして開く方法（`file://`）では動きません。
- 起動後はインターネット接続は不要です。外部への通信は行いません。
- 進捗の JSON は形式に版があり、版が上がっても前の版のファイルを達成印を保ったまま読み込めます。
- 進捗はブラウザの中（IndexedDB）にだけ保存されます。消すときは課題一覧の「進捗をすべて削除」か、ブラウザで `127.0.0.1` のサイトデータを削除します。
- 一覧と演習画面の「設定」で、動き（アニメーション）のオン／オフを選べます。初期値は OS の設定に従います。設定はこのブラウザに保存され、進捗ファイルには含まれません。
- 検証結果と振り返りの「安全化状況」は、この課題の検証で実行して判定できたテストの合格数から計算し、修正前後と改善履歴を示します。検証した範囲外の安全性や、本番で使える安全性を意味しません。
- XP はステージ到達と、条件を変えた再挑戦への報酬です。達成印の判定は変わりません。保存した XP は演習の記録と照合し、合わない場合は記録から計算し直します。
- 実績と称号は保存した演習記録から機械的に判定します。解除日時も記録から照合し、ヒントや解法を見ても減点はありません。

配布物に同梱する手順書は [docs/local-readme.md](docs/local-readme.md) です。

## 開発

必要なもの：Node.js 22（22.15 以上。機械の状態の圧縮に使う）、pnpm 11（`corepack enable pnpm` で package.json の `packageManager` の版が使われます）、Python 3、PC版 Chrome。

```sh
pnpm install            # 依存のインストールと Git フックの有効化（依存のビルドは pnpm-workspace.yaml の allowBuilds で制御）
pnpm run build          # dist/ に静的成果物を生成する（DOM 安全性・依存の境界・外部参照も検査）
pnpm run serve          # http://127.0.0.1:8000/ で dist/ を配信
pnpm run typecheck      # 型検査
pnpm test               # ユニットテスト
pnpm run test:e2e       # ビルドしてから Chrome で E2E テスト
pnpm run verify:packs   # 同梱パックの出荷前検証（基準・レシピ・対策が期待どおりか）
pnpm run package        # 配布用の ZIP を release/ に作る
pnpm run test:dist      # ZIP を展開して localhost で開き、Chrome で確かめる
node scripts/check-dom-safety.mjs  # 学習UIが HTML として挿入する API を使っていないか（ビルドでも実行）
```

演習用の機械（本物の Linux を動かす課題で使う）の配布物は、ビルドとユニットテストの前に `.machine/` へ自動で作ります（`node scripts/build-machine.mjs` でも作れます）。初回は、Alpine Linux の最小構成・sudo・カーネルと v86 の BIOS を、版とハッシュを固定して取得します（約 31MB。取得したものは `.machine/cache/` に残し、次からは取りに行きません）。取得元は、このリポジトリのリリース（[machine-sources-1](https://github.com/ysj101/patchquest/releases/tag/machine-sources-1)）に保管したものです。Alpine Linux の配布元から古い版が消えても、ビルドできます。版を上げる手順は [docs/machine-sources.md](docs/machine-sources.md) にあります。取得するのはこのときだけで、配布物は実行時に外へ取りに行きません。

### 品質ゲート

`pnpm install` の `prepare` は `hooks:install` を呼び、`.githooks` を有効にします。既存の pre-commit 品質ゲートも動きます。Git 管理外や Git 設定を書けない環境でもインストールは続行します。

#### コミットと PR のメールアドレス保護

公開リポジトリに個人のメールアドレスを残さないため、コミットの author / committer のメール欄、コミットメッセージ全文、PR の題名と本文に **許可リスト以外のアドレスが入っていたら失敗** します。ファイルの中身は調べません。判定は末尾一致で、既定の許可リストは `@users.noreply.github.com`・`noreply@github.com`・`noreply@anthropic.com` です（`EMAIL_ALLOWLIST` 環境変数で差し替え可）。一致したアドレスは `@` より前を伏せて表示します。

- **ローカル**: `pnpm install` の `prepare` が `.githooks/` を有効にし、`commit-msg` フックが作成前のコミットを止めます。黙って書き換えることはしません。
- **CI**: 既存の CI ワークフローの `品質ゲート・ビルド` ジョブの最初のステップとして同じ検査を実行します。失敗するとこのジョブが落ちます。squash merge のメッセージも main への push 時に検査します。

```sh
scripts/check-email-privacy.sh                    # origin/main..HEAD
scripts/check-email-privacy.sh BASE_SHA..HEAD_SHA # 任意の範囲
PR_TITLE='変更の題名' PR_BODY='変更の説明' scripts/check-email-privacy.sh
```

このフックはこのリポジトリだけを守ります。全リポジトリをまとめて守るには、GitHub の Settings → Emails で「Keep my email addresses private」と「Block command line pushes that expose my email」を有効にし、Git に `git config --global user.useConfigOnly true` を設定してください。

`pnpm run check` で次をまとめて実行します。作業の約束事は [AGENTS.md](AGENTS.md) を参照してください。

```sh
pnpm run typecheck          # 型検査（TypeScript 7）
pnpm run lint               # ESLint：関数の大きさ・複雑さ、型の安全性、層の依存の向き（platform の内側を含む）、循環参照
pnpm run check:boundaries   # 課題同士・プラットフォームと課題の依存の境界、コアでの課題 ID の分岐（ビルドでも実行）
pnpm run check:duplication  # jscpd：origin/main になかった重複コードがあれば失敗
pnpm run check:unused       # knip：使われていないファイル・export・依存
pnpm run test:coverage      # ユニットテストとカバレッジの下限
```

- 導入時点で残っていた lint 違反は `eslint-suppressions.json` に件数ごと記録してあり、増えたときだけ失敗します。直したら `pnpm run lint:prune` で記録を減らします。
- `pnpm run audit:duplication` は重複を git blame 付きで一覧し、`report/` に HTML を出します（定期的に眺める用。毎週 CI でも作ります）。
- ESLint（typescript-eslint）は TypeScript 7 の API にまだ対応していないため、`typescript` は TypeScript 6 の API 互換パッケージ（`@typescript/typescript6`）を指し（pnpm-workspace.yaml の catalog。依存パッケージの分も overrides で揃える）、型検査の `tsc` は `@typescript/native`（TypeScript 7）を使います。

push（main）と PR ごとに、GitHub Actions（`.github/workflows/ci.yml`）が次を実行します。
- 品質ゲート（`pnpm run check`）とビルド（DOM 安全性・依存の境界・外部参照の検査を含む）
- Chrome の E2E（出荷前検証を含む）、配布物の確認

課題パックの作り方は [docs/pack-authoring.md](docs/pack-authoring.md) を参照してください。

## ディレクトリ構成

| ディレクトリ | 内容 |
| - | - |
| platform/ | 共通UI、実行制御、評価、保存 |
| runtimes/browser/ | ブラウザ用 RuntimeAdapter |
| apps/memo/ | 教材アプリ「メモ帳」と交換フック |
| apps/shell/ | 教材アプリ「擬似シェル」と「Linux 端末」（`linux/`。本物の Linux を WASM のエミュレータで動かす）、交換フック（ターミナルで設定を調べて直す課題の土台） |
| missions/ | 課題パック。開発用の固有テストと検証データは各パックの `__tests__/` |
| catalog/ | 同梱パックの登録 |
| tests/ | 共通のユニットテスト（tests/unit）と E2E テスト（tests/e2e）、テスト用の部品（tests/support） |
| scripts/ | ビルドと検査のスクリプト、効果の検証の集計（`pnpm run metrics`。[docs/evaluation-metrics.md](docs/evaluation-metrics.md)） |

## 依存ソフトウェアのライセンス

| 名前 | 用途 | ライセンス |
| - | - | - |
| SQLite（`@sqlite.org/sqlite-wasm` に同梱） | 教材アプリのデータベース（配布物に同梱） | パブリックドメイン |
| `@sqlite.org/sqlite-wasm` | SQLite の WebAssembly 版ラッパー（配布物に同梱） | Apache License 2.0 |
| v86 | 演習用の機械（x86 のエミュレータ。配布物に同梱） | BSD-2-Clause |
| SeaBIOS rel-1.16.2 と、その VGA BIOS（v86 のリポジトリにあるビルド済みのもの） | 演習用の機械の BIOS（配布物に同梱） | LGPL-3.0 |
| Linux カーネル 6.18.64（Alpine Linux の `linux-virt`） | 演習用の機械の中身（起動を済ませた状態として配布物に同梱。以下同じ） | GPL-2.0 |
| BusyBox 1.37.0・apk-tools 3.0.9・pax-utils 1.3.9（scanelf）・alpine-baselayout 3.7.2 | Alpine Linux 3.24.4 の最小構成 | GPL-2.0 |
| musl 1.2.6 | Alpine Linux 3.24.4 の最小構成 | MIT（musl-utils の一部は BSD-2-Clause・GPL-2.0 以降） |
| OpenSSL 3.5.9（libcrypto・libssl） | Alpine Linux 3.24.4 の最小構成 | Apache License 2.0 |
| ca-certificates 20261020・Alpine Linux の署名鍵とリリース情報 | Alpine Linux 3.24.4 の最小構成 | MPL-2.0 / MIT |
| sudo 1.9.17p2・zlib 1.3.2 と 1.4 | 演習用の機械の中身（zlib 1.3.2 は最小構成、ほかは足したパッケージ） | ISC ほか（sudo）/ Zlib |
| esbuild・Vitest・Playwright・TypeScript | 開発時のビルドとテスト（配布物には含まない） | MIT / Apache License 2.0 |
| ESLint・typescript-eslint・eslint-plugin-import-x・eslint-import-resolver-typescript・globals・jscpd・knip | 開発時の静的検査（配布物には含まない） | MIT / ISC |
| eslint-plugin-sonarjs | 開発時の静的検査（配布物には含まない） | LGPL-3.0 |

演習用の機械に入っているソフトウェアの一覧は、実物（最小構成のパッケージのデータベースと、足したパッケージの情報）と照合してあります（`scripts/machine-licenses.mjs`。`tests/unit/machine-licenses.test.ts` が、版を上げたときの食い違いを止めます）。配布物には、この一覧・ソースコードの入手先・ライセンスの全文を `assets/linux-machine.LEGAL.txt` として同梱します。

GPL・LGPL・MPL のソフトウェアに対応するソースコード（上流のソースと、Alpine Linux のビルド定義）は、このリポジトリのリリース [machine-sources-1](https://github.com/ysj101/patchquest/releases/tag/machine-sources-1) に、バイナリと一緒に置いてあります。

効果音は初期値オフです。設定で音量とオン／オフを変更でき、同梱コードで合成するため外部通信は行いません。
