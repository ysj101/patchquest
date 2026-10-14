# PatchQuest

ブラウザ上で動く教材アプリに、よくあるアプリケーション脆弱性を独立した課題パックとして注入する学習プラットフォームです。仕様は [docs/spec.md](docs/spec.md) を参照してください。

## 公開版を使う

インストールなしで試すには、PC版の Chrome または Edge で <https://ysj101.github.io/patchquest/> を開きます。

- ローカル版と同じビルド成果物を GitHub Pages で静的に配信しているだけで、サーバー側の処理や外部 API はありません。
- 進捗はローカル版と同じくブラウザの中（IndexedDB）にだけ保存され、利用履歴を外部に送信しません。消すときは課題一覧の「進捗をすべて削除」か、ブラウザで `ysj101.github.io` のサイトデータを削除します。
- main ブランチへの反映時に [.github/workflows/pages.yml](.github/workflows/pages.yml) が自動で配信し直します。PR ごとのプレビューはありません。
- オフラインで使う、または配信先に依存せずに手元で動かすときは、次のローカル版を使います。

## ローカル版を使う

配布用の ZIP（`pnpm run package` で `release/` に作成）を展開し、展開したフォルダで localhost 限定の静的サーバを起動して、PC版の Chrome または Edge で開きます。

```sh
python3 -m http.server 8000 --bind 127.0.0.1   # Windows は py -m http.server 8000 --bind 127.0.0.1
# ブラウザで http://127.0.0.1:8000/ を開く
```

- 動作を確認したブラウザ：Google Chrome 154、Microsoft Edge 155（macOS）
- `index.html` をダブルクリックして開く方法（`file://`）では動きません。
- 起動後はインターネット接続は不要です。外部への通信は行いません。
- 進捗はブラウザの中（IndexedDB）にだけ保存されます。消すときは課題一覧の「進捗をすべて削除」か、ブラウザで `127.0.0.1` のサイトデータを削除します。

配布物に同梱する手順書は [docs/local-readme.md](docs/local-readme.md) です。

## 開発

必要なもの：Node.js 22、pnpm 11（`corepack enable pnpm` で package.json の `packageManager` の版が使われます）、Python 3、PC版 Chrome または Edge。

```sh
pnpm install            # 依存のインストール（依存のインストールスクリプトは実行しない。pnpm-workspace.yaml の allowBuilds）
pnpm run hooks:install  # コミット前の品質ゲート（.githooks/pre-commit）を有効にする。最初に一度だけ
pnpm run build          # dist/ に静的成果物を生成する（DOM 安全性・依存の境界・外部参照も検査）
pnpm run serve          # http://127.0.0.1:8000/ で dist/ を配信
pnpm run typecheck      # 型検査
pnpm test               # ユニットテスト
pnpm run test:e2e       # ビルドしてから Chrome・Edge で E2E テスト
pnpm run verify:packs   # 同梱パックの出荷前検証（基準・レシピ・対策が期待どおりか）
pnpm run package        # 配布用の ZIP を release/ に作る
pnpm run test:dist      # ZIP を展開して localhost で開き、Chrome・Edge で確かめる
node scripts/check-dom-safety.mjs  # 学習UIが HTML として挿入する API を使っていないか（ビルドでも実行）
```

### 品質ゲート

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
- Chrome・Edge の E2E（出荷前検証を含む）、配布物の確認

課題パックの作り方は [docs/pack-authoring.md](docs/pack-authoring.md) を参照してください。

## ディレクトリ構成

| ディレクトリ | 内容 |
| - | - |
| platform/ | 共通UI、実行制御、評価、保存 |
| runtimes/browser/ | ブラウザ用 RuntimeAdapter |
| apps/memo/ | 教材アプリと交換フック |
| missions/ | 課題パック。開発用の固有テストと検証データは各パックの `__tests__/` |
| catalog/ | 同梱パックの登録 |
| tests/ | 共通のユニットテスト（tests/unit）と E2E テスト（tests/e2e）、テスト用の部品（tests/support） |
| scripts/ | ビルドと検査のスクリプト |

## 依存ソフトウェアのライセンス

| 名前 | 用途 | ライセンス |
| - | - | - |
| SQLite（`@sqlite.org/sqlite-wasm` に同梱） | 教材アプリのデータベース（配布物に同梱） | パブリックドメイン |
| `@sqlite.org/sqlite-wasm` | SQLite の WebAssembly 版ラッパー（配布物に同梱） | Apache License 2.0 |
| esbuild・Vitest・Playwright・TypeScript | 開発時のビルドとテスト（配布物には含まない） | MIT / Apache License 2.0 |
| ESLint・typescript-eslint・eslint-plugin-import-x・eslint-import-resolver-typescript・globals・jscpd・knip | 開発時の静的検査（配布物には含まない） | MIT / ISC |
| eslint-plugin-sonarjs | 開発時の静的検査（配布物には含まない） | LGPL-3.0 |
