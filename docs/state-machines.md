# 状態遷移の一覧

コードの中の状態遷移と、その書き方をまとめる。状態を複数のフラグや DOM の属性の組み合わせで持つと、ありえない組み合わせや、処理の途中の割り込みを見落とす。状態には名前を付け、移り方は表か、状態ごとの型で書く。TLA+ のモデルは [docs/formal](formal/README.md) にある。

## 明示的なモデルで書いているもの

| 対象 | 状態 | 書いてある場所 | TLA+ |
| - | - | - | - |
| 演習の進行 | `Selected`・`Preflight`・`Prepared`・`Explored`・`Repairing`・`Verifying`・`Passed`・`Blocked`。出来事（`ExerciseEvent`）で移る | `platform/contract/attempt.ts` の `EXERCISE_MACHINE`。進行役（`platform/orchestrator/orchestrator.ts`）は `dispatch` でだけ状態を動かす | `Exercise.tla` |
| 実行環境（ブラウザ） | `idle`・`ready`・`halted`・`disposed` | `runtimes/browser/adapter.ts` の `Phase` | `Runtime.tla` |
| 実行エンジンの準備 | 準備されていない・準備してある（`state`）。準備・初期化・破棄は順番に行う（`lifecycle`） | `runtimes/browser/engine.ts` | `Engine.tla` |
| プレビュー（隔離 iframe の Host 側） | `loading`・`idle`・`rendering`・`showing`・`disposed` | `runtimes/browser/preview-host.ts` の `FrameState` | `Preview.tla` |
| 検証インスタンス | `none`・`started`・`prepared` | `platform/evaluator/evaluator.ts` の `Instance` | `Evaluator.tla` |
| 進捗の保存先 | `persistent`・`switching`・`memory` | `platform/progress/store.ts` の `Storage` | `Storage.tla` |
| 描き直しの直列化 | 待っている要求・実行中の要求（`running`） | `platform/ui/serial.ts` | `SerialLatest.tla` |
| 学習UIの画面 | `list`・`records`・`preflight`・`exercise` | `platform/ui/screen.ts` の `SCREEN_MACHINE`。`platform/ui/app.ts` は `nextScreen` でだけ画面を移る | `Navigation.tla` |
| 小さな説明（ポップオーバー） | `closed`・`peek`・`pinned`・`pinned-over`・`dismissed` | `platform/ui/popover-model.ts` の `POPOVER_MACHINE` | `Popover.tla` |
| 端末の画面 | `prompt`・`running`・`editing`（編集画面は、保存中かどうかを `saving` で持つ） | `apps/shell/view.ts` の `Terminal`、`apps/shell/editor-view.ts` | `Terminal.tla` |
| 操作ガイド | `off`・`guiding`・`closed`。ステップは `done`・`current`・`skipped`・`todo`（`StepState`。起きた出来事と飛ばしたステップから導く） | `platform/ui/guide.ts` の `GuidePanel` | `Guide.tla` |

## 処理の途中の割り込みについての決まり

進行役の処理は `await` で区切られ、その間に別の操作が届く。次の決まりで、どの順番で届いても遷移表から外れないようにしている（`Exercise.tla` が検査する）。

- 修正の構成を変える処理（対策の切り替え・修正の記録・初期化）は、1 件ずつ順に行う（`Orchestrator.change`）。順番を待つ間に別の演習が始まったら、実行しない。
- 実装の選択・修正の記録と、構成のハッシュは、まとめて書き換える（食い違って見える間を作らない）。
- 検証が始まってから終わるまで `Verifying` に留まる。その間に構成が変わっても（修正の記録が増えても）、状態は動かさず、確かめた結果を古い構成のものとして扱う。
- 初期化は、実装とデータを戻し終える前に、状態を `Prepared` へ戻す。戻している間は検証を始められない。発行済みの実行 ID を無効にするので、戻す前のやり取りが遅れて届いても、修正の記録にはならない。画面へは、戻し終えてから知らせる。
- `start` と `retryPreflight` は、自分が始めた演習の状態を返す。事前検証の間に別の演習が始まっていたら、画面はその続きを行わない。

## 名前を付けていないもの

次のものは、1 つの変数の値がそのまま状態で、取りうる値の組み合わせに「ありえないもの」がない。移り方にも制約がないか、一方向の 1 回だけなので、表にはしていない。

| 対象 | 状態の持ち方 |
| - | - |
| 事前検証の各ステップ（`PreflightEntry.status`） | `running` → `passed`・`failed`。ステップは `compatibility`・`baseline`・`inject`・`prepare` の順に進み、失敗したら後続を実行しない（`platform/orchestrator/preflight.ts`） |
| 達成印（`Badge.achieved`）、到達時刻（`milestones`）、初回合格（`firstPass`） | 一度付いたら消えない。演習を始め直したときだけ、続きからでなければ空に戻る |
| 達成印の表示（`SealState`）、ステージ（`stageStates`） | 記録と `defenseCurrent` から毎回導く。状態を別に持たない（`platform/progress/stages.ts`） |
| 演習用の機械との往復（`Machine.waiting`） | 応答を待っている要求が 1 件あるか、ないか。要求は 1 件ずつ順に送る（`runtimes/browser/machine.ts`） |
| プレビューの中の表示（`preview.inline.ts` の `current`） | いま描画している実行 ID。新しい描画の指示で入れ替わる |
| 通信・保存の API を塞いだか（`lockdown.ts` の `locked`）、SQLite の読み込み（`sqlite.ts`）、効果音の `AudioContext` | 一度だけ切り替わり、戻らない |
| 保存の予約（`app.ts` の `saveScheduled`） | 予約していない・予約した。同じ区切りの中の変更を 1 回の保存にまとめる |
| 報酬の通知（`RewardNotice`） | 初回表示かどうか（`previous`）と、一時表示のタイマー |
| 編集画面の保存（`editor-view.ts` の `saving`） | 保存を送っている間だけ `true`。その間は保存も、閉じる操作も受け付けない（`Terminal.tla` に含めて検査する） |
| 導入の表示、結果のコールアウト、タブ、確認ダイアログ、設定のダイアログ | 見せているか、隠しているかの 2 通り。どちらからどちらへも移れる |
| アドレス欄（`AddressBar.shown`） | いま出している画面。画面を移るたびに書き換える |
| IndexedDB を開く処理（`IndexedDbBackend.open`） | 成功・失敗・別タブに妨げられた、のどれかで 1 回だけ決まる |
