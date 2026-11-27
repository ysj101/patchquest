# AGENTS.md

このリポジトリで作業するコーディングエージェントと人のための約束事。仕様は [docs/spec.md](docs/spec.md)、課題パックの契約は [docs/pack-authoring.md](docs/pack-authoring.md) を参照する。

## 完了の条件

- `pnpm run check` がすべて通る（型・lint・依存の境界・新しい重複・未使用コード・ユニットテストとカバレッジ）。
- E2E（`pnpm run test:e2e`）と出荷前検証（`pnpm run verify:packs`）は、完了の条件として手元で走らせない。CI で確かめる。原因を調べるときは、手元で走らせてよい。
- 課題パックを新しく作る・題材や解き方を変えるときは、実装の前に、学習者に持ち帰ってもらうことと、仕組みをどう理解してもらうかを決める。題材には、独自の仕組みを作らず、広く知られている仕組みを使う。直す操作を教材だけにある設定の切り替えにせず、仕組みは学習者が自分の操作で見られるようにする。手順は [.claude/skills/design-mission/SKILL.md](.claude/skills/design-mission/SKILL.md)。
- 同じ場合は、実装のあとに、学習者として最初から「解決」まで解いて確かめる。製品ビルドを Chrome で開き、画面に出ている案内だけを頼りに、クリックとキー入力で進める。手順は [.claude/skills/playtest-mission/SKILL.md](.claude/skills/playtest-mission/SKILL.md)。自動テストが通っていても、これを終えるまで完了にしない。試した操作と結果、確かめていないことを報告に書く。教材アプリの画面・コマンドの受け付け方・学習者に見える文だけを変えたときは、これを行わない。
- 実行していない検査を「通った」と書かない。
- 上の検査が通ったら、頼まれなくても PR の作成まで進める。main から切ったブランチにコミットして push し、`gh pr create` で PR を作って URL を報告する。本文には変更の内容と、手元で実行した検査・その結果、CI で確かめる検査を分けて書き、完了させる Issue があれば `Closes #N` で紐づける。マージは、頼まれたときだけ行う。
- PR を作ったら、CI の結果を確かめる（`gh pr checks <番号> --watch`）。落ちたら原因を調べて直す。
- 調査や質問への回答だけで、ファイルを変えていないときは PR を作らない。

## worktree の置き場所

- 並行して作業するための git worktree は、リポジトリ直下の `.worktrees/<名前>` に作る（`git worktree add .worktrees/<名前> -b <ブランチ> origin/main`）。リポジトリの隣や一時フォルダには作らない。
- `.worktrees/` は `.gitignore` に入れてあり、lint・重複・未使用コードの検査は中を見ない。
- PR がマージされたら、`git worktree remove .worktrees/<名前>` で片づける。

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
| テスト用の記録・パック・アプリ・実行環境 | `tests/support/`（`makeAttempt`・`testPack`・`testApp`・`EngineRuntime`・`requestOnly`・`forNode`） |
| 課題パックの開発用の検証データ | `tests/support/verification-data.ts`（`PackVerificationData`）。各パックの `__tests__/verification.ts` に書き、`tests/support/catalog.ts` で登録する |

## コードの書き方

- 失敗は早く、はっきり知らせる。値がない・想定外のときに、黙って既定値で続けない。
- ダミー実装、何もしない実装、TODO だけの関数を残さない。
- 仕様や契約に書いていないことを推測で埋めない。決める前に確認する。
- 関数やファイルの大きさ・複雑さ、名前の長さ、`enum` の禁止などの機械的な基準は `eslint.config.mjs` にあり、lint が止める。上限を超えたら分ける。
- ファイルの先頭に役割を1行で書く。名前だけで意図が伝わらない公開関数・型には `/** */` で目的と注意点を日本語で書く。

## テスト

- テスト名と期待値は日本語で、何を確かめるかが読んで分かるように書く（`tests/unit` の既存のテストに合わせる）。
- リファクタでは、テストの変更と実装の変更を同じ変更に混ぜない。片方を固定して、もう片方を変える。
- 画面・Worker・iframe・DOM に触れるコードは E2E（`tests/e2e`）で確かめる（走らせるのは CI）。それ以外はユニットテストで確かめ、カバレッジの下限（`vitest.config.ts`）を下げない。
- 演習用の機械（本物の Linux）を起動する E2E には、`MACHINE`（`tests/e2e/fixtures.ts`）の印を付ける。機械は CPU を使い切るので、印のあるテストは、ほかのテストのあとに 1 件ずつ走らせる（手元の `pnpm run test:e2e`。CI は別のジョブに分ける）。印のないテストが機械を起動すると失敗する。
- 課題パック固有のテストと検証データは、パックの `missions/<課題>/__tests__/` に置く（[docs/pack-authoring.md](docs/pack-authoring.md) §7）。全パック共通の出荷前検証（全 seed・対策の `expected`）で確かめられることは、パックごとに書かない。

## 報告

- ファイルは `path:行番号` で示す。
