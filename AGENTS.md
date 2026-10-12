# AGENTS.md

このリポジトリで作業するコーディングエージェントと人のための約束事。仕様は [docs/spec.md](docs/spec.md)、課題パックの契約は [docs/pack-authoring.md](docs/pack-authoring.md) を参照する。

## 完了の条件

- `pnpm run check` がすべて通る（型・lint・依存の境界・新しい重複・未使用コード・ユニットテストとカバレッジ）。
- 画面や実行環境に触れたら `pnpm run test:e2e` も通す。課題パックを変えたら `pnpm run verify:packs` も通す。
- 実行していない検査を「通った」と書かない。

## 基準を緩めない

検査を通すために、次のことをしない。どうしても必要なときは理由を書いて人に相談する。

- `eslint-suppressions.json` の件数を増やす、`eslint-disable` コメントを書く
- `eslint.config.mjs`・`.jscpd.json`・`knip.json`・`vitest.config.ts` のルール・閾値・除外を緩める（例外：画面・Worker・iframe・DOM に触れて E2E で確かめるファイルは、カバレッジの対象から外してよい）

`eslint-suppressions.json` は導入時点で残っていた違反の件数の記録。同じファイル・同じルールの違反が増えると lint が失敗する。違反を直したら `pnpm run lint:prune` で記録を減らす（減らさないと lint が失敗する）。

## 層と依存の向き

各層が import してよい先は `eslint.config.mjs` の `LAYERS` に書いてあり、違反は lint が止める。`platform/`・`runtimes/`・`apps/` の下に場所を足したら、`LAYERS` にも足す（足すまで lint が失敗する）。製品コードから `tests/` と `scripts/` は import できない。

課題同士は依存せず、プラットフォームは課題と教材アプリを `@catalog` 経由でだけ扱う。コアに課題 ID による条件分岐を書かない（spec §11.3）。これらは `scripts/check-boundaries.mjs`（`pnpm run check:boundaries`。ビルドでも実行）が止める。

## 書く前に既存の部品を探す

重複は CI（jscpd）が止める。似た処理を見つけたら、コピーせずに共通化する。

| 用途 | 場所 |
| - | - |
| 学習UIの DOM を組み立てる | `platform/ui/dom.ts`（`h`・`fill`・`renderGuard`・`announce`） |
| 学習UIの部品（状態表示・確認ダイアログ・タブなど） | `platform/ui/components.ts` |
| 教材アプリの DOM を組み立てる | `apps/shared/dom.ts`（`el`） |
| 教材アプリの JSON 応答 | `apps/shared/http.ts`（`json`） |
| seed から決まる乱数 | `apps/shared/random.ts`（`random`） |
| 契約の型と検証 | `platform/contract`（`index.ts` から import する） |
| テスト用の記録・パック・アプリ・実行環境 | `tests/support/`（`makeAttempt`・`testPack`・`testApp`・`EngineRuntime`・`requestOnly`） |

## コードの書き方

- 失敗は早く、はっきり知らせる。値がない・想定外のときに、黙って既定値で続けない。
- ダミー実装、何もしない実装、TODO だけの関数を残さない。
- 仕様や契約に書いていないことを推測で埋めない。決める前に確認する。
- 関数やファイルの大きさ・複雑さ、名前の長さ、`enum` の禁止などの機械的な基準は `eslint.config.mjs` にあり、lint が止める。上限を超えたら分ける。
- ファイルの先頭に役割を1行で書く。名前だけで意図が伝わらない公開関数・型には `/** */` で目的と注意点を日本語で書く。

## テスト

- テスト名と期待値は日本語で、何を確かめるかが読んで分かるように書く（`tests/unit` の既存のテストに合わせる）。
- リファクタでは、テストの変更と実装の変更を同じ変更に混ぜない。片方を固定して、もう片方を変える。
- 画面・Worker・iframe・DOM に触れるコードは E2E（`tests/e2e`）で確かめる。それ以外はユニットテストで確かめ、カバレッジの下限（`vitest.config.ts`）を下げない。

## 報告

- ファイルは `path:行番号` で示す。
