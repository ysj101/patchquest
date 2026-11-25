------------------------------ MODULE Terminal ------------------------------
(***************************************************************************)
(* 擬似シェルの画面（apps/shell/view.ts の Terminal と、                   *)
(* apps/shell/editor-view.ts の編集画面）のモデル。                        *)
(*                                                                         *)
(* 端末は prompt（コマンドを受け付けている）、running（コマンドを送って    *)
(* 応答を待っている）、editing（編集画面が出ている）のどれか。編集画面は、 *)
(* 保存を送っている間（saving）、もう一度の保存も、閉じる操作も受け付け    *)
(* ない。教材ロジックへの要求が重ならないことを検査する。                  *)
(***************************************************************************)
EXTENDS Naturals

VARIABLES
  mode,     \* 端末の状態
  saving,   \* 編集画面が保存を送っている途中か
  flying    \* 応答を待っている要求（コマンド・保存）の数

vars == <<mode, saving, flying>>

Modes == {"prompt", "running", "editing"}

TypeOK == mode \in Modes /\ saving \in BOOLEAN /\ flying \in 0..2

Init == mode = "prompt" /\ saving = FALSE /\ flying = 0

\* Enter でコマンド行を送る。入力欄は prompt のときだけ使える（running では止まり、editing では隠れる）
Submit ==
  /\ mode = "prompt"
  /\ mode' = "running" /\ flying' = flying + 1
  /\ UNCHANGED saving

\* コマンドの応答が届く。エディタを開くコマンド（visudo）が成功したら、編集画面を出す
Reply ==
  /\ mode = "running"
  /\ flying' = flying - 1
  /\ \E editor \in BOOLEAN : mode' = IF editor THEN "editing" ELSE "prompt"
  /\ UNCHANGED saving

\* 保存する（Ctrl+S・ボタン）。変更がなければ、送らずに閉じる
Save ==
  /\ mode = "editing" /\ ~saving
  /\ \/ mode' = "prompt" /\ UNCHANGED <<saving, flying>>
     \/ saving' = TRUE /\ flying' = flying + 1 /\ UNCHANGED mode

\* 保存の応答が届く。保存できたら閉じ、できなかったら理由を出して編集を続ける
Saved ==
  /\ saving
  /\ saving' = FALSE /\ flying' = flying - 1
  /\ \E ok \in BOOLEAN : mode' = IF ok THEN "prompt" ELSE "editing"

\* 保存せずに閉じる（Esc・ボタン）。保存を送っている間は受け付けない
Cancel ==
  /\ mode = "editing" /\ ~saving
  /\ mode' = "prompt"
  /\ UNCHANGED <<saving, flying>>

Next == Submit \/ Reply \/ Save \/ Saved \/ Cancel

Spec == Init /\ [][Next]_vars /\ WF_vars(Reply) /\ WF_vars(Saved)

-----------------------------------------------------------------------------
\* 教材ロジックへの要求は重ならない（コマンドの二重送信・保存の二重送信・保存中のコマンドがない）
OneRequestAtATime == flying <= 1

\* 応答を待っているのは、コマンドの実行中か、保存の途中のときだけ
FlyingMatchesState == (flying = 1) <=> (mode = "running" \/ saving)

\* 保存を送っているのは、編集画面が出ている間だけ（閉じたあとで保存が成り立つことはない）
SavingOnlyWhileEditing == saving => (mode = "editing")

\* コマンドの実行と保存は、いつか終わる
RunningEnds == (mode = "running") ~> (mode # "running")
SavingEnds == saving ~> ~saving
=============================================================================
