# PatchQuest

ブラウザ上で動く教材アプリに、よくあるアプリケーション脆弱性を独立した課題パックとして注入する学習プラットフォームです。仕様は [docs/spec.md](docs/spec.md) を参照してください。

> 開発中です。配布物の使い方は今後この README に追記します。

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
