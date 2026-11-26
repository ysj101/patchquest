# TLA+ のモデル

コードに書いた状態遷移（[docs/state-machines.md](../state-machines.md)）を TLA+ で書き、TLC（モデル検査器）で、起こりうる順番をすべてたどって確かめる。

## モデルと、確かめること

| モデル | 対象のコード | 確かめること |
| - | - | - |
| `Exercise.tla` | `platform/orchestrator/orchestrator.ts`、`platform/contract/attempt.ts`（`EXERCISE_MACHINE`） | 処理の途中（検証中・対策の切り替え中・初期化中・別の演習の開始）でも遷移表から外れない。検証中であることと検証の実行が一致し、検証は重ならない。Passed は達成印がそろったときだけ。現在の合格は、いまの構成を確かめた合格に限る。始めた検証はいつか終わる |
| `Runtime.tla` | `runtimes/browser/adapter.ts`（`Phase`） | Worker が動いているのは ready のときだけ。応答を待ったままの呼び出しを残さない。結果は一度しか決まらない。破棄したら戻らない |
| `Engine.tla` | `runtimes/browser/engine.ts` | 準備を続けて頼んでも、機械は 1 台まで。止め忘れた機械がない。最後に頼んだ準備が残る |
| `Preview.tla` | `runtimes/browser/preview-host.ts`（`FrameState`） | 完了を待つ描画は描画中の 1 件だけ。古い実行 ID のメッセージは受け付けない。頼んだ描画はいつか終わる |
| `Evaluator.tla` | `platform/evaluator/evaluator.ts`（`Instance`） | テストは、頼まれた構成を準備したインスタンスでだけ実行する。結果を返すのは、いちばん新しい検証だけ |
| `Storage.tla` | `platform/progress/store.ts`（`Storage`） | 保存先が書けなくなっても、書き込みが消えない。保存先は persistent → switching → memory の向きにだけ進む |
| `SerialLatest.tla` | `platform/ui/serial.ts` | 実行は重ならない。落ち着いたとき、最後に終えた実行は、最後の要求（または、それが合流した実行）である |
| `Navigation.tla` | `platform/ui/app.ts`、`platform/ui/screen.ts`（`SCREEN_MACHINE`） | 演習画面に出すのは、開始前チェックに合格した、いまの演習だけ。古い点検の続きが画面を動かさない |
| `Popover.tla` | `platform/ui/popover-model.ts`（`POPOVER_MACHINE`） | 状態が表すマウスの位置は、本当の位置と食い違わない。届く操作には必ず遷移表の行がある |
| `Terminal.tla` | `apps/shell/view.ts`、`apps/shell/editor-view.ts` | 教材ロジックへの要求（コマンド・保存）は重ならない。閉じたあとで保存が成り立たない |
| `Guide.tla` | `platform/ui/guide.ts` | 閉じたガイドは裏で進まない。同じ演習の中では、進み具合は戻らない |

`EngineLegacy.cfg` と `StorageLegacy.cfg` は、書き換える前の実装を再現する設定。不変条件が破れること（機械が 2 台起動する・書き込みが消える）を、反例で確かめる。

## コードとの対応

- 遷移表（`Exercise.tla` の `Transitions`、`Popover.tla` の `Transitions`、`Navigation.tla` の `Moves`）は、コードの表と同じ組を同じ順に並べる。`tests/unit/formal-models.test.ts` が一致を確かめるので、片方だけを書き換えると `pnpm run check` が失敗する。
- それ以外の動作（await の区切り、順番待ち、失敗の扱い）は、コードを読んで書き写したもの。コードを変えたら、対応するモデルの動作も直す。各モデルの先頭に、対象のコードと、モデルにしていないことを書いてある。

## 実行のしかた

Java（17 以上）と [tla2tools.jar](https://github.com/tlaplus/tlaplus/releases) が要る。リポジトリには含めていない。

```sh
JAVA_HOME=/path/to/jdk TLA2TOOLS=/path/to/tla2tools.jar pnpm run check:formal
# 1 つだけ検査する（設定の名前を渡す）
JAVA_HOME=/path/to/jdk TLA2TOOLS=/path/to/tla2tools.jar pnpm run check:formal Exercise
```

Java が要るので、`pnpm run check` には含めていない。モデルか、対象のコードの状態遷移を変えたときに実行する。
