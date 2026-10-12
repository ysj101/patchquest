# PatchQuest

ブラウザ上で動く教材アプリに、よくあるアプリケーション脆弱性を独立した課題パックとして注入する学習プラットフォームです。仕様は [docs/spec.md](docs/spec.md) を参照してください。

## ローカル版を使う

配布用の ZIP（`npm run package` で `release/` に作成）を展開し、展開したフォルダで localhost 限定の静的サーバを起動して、PC版の Chrome または Edge で開きます。

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

必要なもの：Node.js 22、Python 3、PC版 Chrome または Edge。

```sh
npm ci              # 依存のインストール（インストールスクリプトは実行しない設定）
npm run build       # dist/ に静的成果物を生成し、外部参照がないことを検査
npm run serve       # http://127.0.0.1:8000/ で dist/ を配信
npm run typecheck   # 型検査
npm test            # ユニットテスト
npm run test:e2e    # ビルドしてから Chrome・Edge で E2E テスト
npm run verify:packs  # 同梱パックの出荷前検証（基準・レシピ・対策が期待どおりか）
npm run package     # 配布用の ZIP を release/ に作る
npm run test:dist   # ZIP を展開して localhost で開き、Chrome・Edge で確かめる
node scripts/check-dom-safety.mjs  # 学習UIが HTML として挿入する API を使っていないか（ビルドでも実行）
```

課題パックの作り方は [docs/pack-authoring.md](docs/pack-authoring.md) を参照してください。

## ディレクトリ構成

| ディレクトリ | 内容 |
| - | - |
| platform/ | 共通UI、実行制御、評価、保存 |
| runtimes/browser/ | ブラウザ用 RuntimeAdapter |
| apps/memo/ | 教材アプリと交換フック |
| missions/ | 課題パック |
| catalog/ | 同梱パックの登録 |
| tests/ | ユニットテスト（tests/unit）と E2E テスト（tests/e2e） |
| scripts/ | ビルドと検査のスクリプト |

## 依存ソフトウェアのライセンス

| 名前 | 用途 | ライセンス |
| - | - | - |
| SQLite（`@sqlite.org/sqlite-wasm` に同梱） | 教材アプリのデータベース（配布物に同梱） | パブリックドメイン |
| `@sqlite.org/sqlite-wasm` | SQLite の WebAssembly 版ラッパー（配布物に同梱） | Apache License 2.0 |
| esbuild・Vitest・Playwright・TypeScript | 開発時のビルドとテスト（配布物には含まない） | MIT / Apache License 2.0 |
