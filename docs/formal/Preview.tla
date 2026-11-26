------------------------------ MODULE Preview ------------------------------
(***************************************************************************)
(* 隔離 iframe（プレビュー）の Host 側（runtimes/browser/preview-host.ts   *)
(* の PreviewFrame）のモデル。                                             *)
(*                                                                         *)
(* 状態は loading（iframe の読み込み待ち）、idle（何も表示していない）、   *)
(* rendering（描画中）、showing（描画を終えて表示している）、disposed      *)
(* （破棄した）。iframe からのメッセージは実行 ID で照合し、いまの描画・   *)
(* 表示のものだけを受け付ける。iframe は、前の描画のメッセージを遅れて     *)
(* 送ってくることがある。                                                  *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS MaxRuns  \* 描画を頼む回数の上限（実行 ID は 1 から順に振る）

VARIABLES
  state,     \* プレビューの状態
  run,       \* いま描画・表示している実行 ID。0 はない
  runs,      \* これまでに頼んだ描画の数
  result,    \* 描画ごとの結果
  accepted   \* 受け付けたメッセージの記録。[from, at]（メッセージの実行 ID と、そのとき表示していた実行 ID）

vars == <<state, run, runs, result, accepted>>

States == {"loading", "idle", "rendering", "showing", "disposed"}
\* none: まだ頼んでいない / pending: 描画の完了を待っている / done: 描画できた / failed: 失敗を返した
Results == {"none", "pending", "done", "failed"}

TypeOK ==
  /\ state \in States
  /\ run \in 0..MaxRuns /\ runs \in 0..MaxRuns
  /\ result \in [1..MaxRuns -> Results]
  /\ accepted \subseteq [from : 1..MaxRuns, at : 1..MaxRuns]

Init ==
  /\ state = "loading" /\ run = 0 /\ runs = 0
  /\ result = [id \in 1..MaxRuns |-> "none"]
  /\ accepted = {}

Active == state \in {"rendering", "showing"}

\* 描画中なら、その描画を失敗で終えたあとの結果
Failing == IF state = "rendering" THEN [result EXCEPT ![run] = "failed"] ELSE result

\* iframe が読み込みを終えた
Ready ==
  /\ state = "loading"
  /\ state' = "idle"
  /\ UNCHANGED <<run, runs, result, accepted>>

\* 画面を描画する（render）。読み込みを待ってから始める。前の描画が終わっていなければ、失敗で終える
Render ==
  /\ state \in {"idle", "rendering", "showing"}
  /\ runs < MaxRuns
  /\ runs' = runs + 1
  /\ run' = runs + 1
  /\ state' = "rendering"
  /\ result' = [Failing EXCEPT ![runs + 1] = "pending"]
  /\ UNCHANGED accepted

\* 破棄したあとで描画を頼まれたら、すぐに断る
RenderRefused ==
  /\ state = "disposed"
  /\ runs < MaxRuns
  /\ runs' = runs + 1
  /\ result' = [result EXCEPT ![runs + 1] = "failed"]
  /\ UNCHANGED <<state, run, accepted>>

(***************************************************************************)
(* iframe からメッセージが届く。from は、そのメッセージの実行 ID（これ     *)
(* までに頼んだ描画のどれか）。いまの描画・表示のものでなければ破棄する。  *)
(* 描画の完了（rendered）と失敗（error）は、描画中のときだけ結果を決める。 *)
(***************************************************************************)
Receive ==
  \E from \in 1..runs, type \in {"rendered", "error", "event", "request"} :
    IF Active /\ from = run
      THEN /\ accepted' = accepted \cup {[from |-> from, at |-> run]}
           /\ IF state = "rendering" /\ type \in {"rendered", "error"}
                THEN /\ state' = "showing"
                     /\ result' = [result EXCEPT ![run] = IF type = "rendered" THEN "done" ELSE "failed"]
                ELSE UNCHANGED <<state, result>>
           /\ UNCHANGED <<run, runs>>
      ELSE UNCHANGED vars

\* 描画が時間内に終わらなかった。表示は続け、あとから届くメッセージは受け付ける
Timeout ==
  /\ state = "rendering"
  /\ state' = "showing"
  /\ result' = [result EXCEPT ![run] = "failed"]
  /\ UNCHANGED <<run, runs, accepted>>

\* 表示をやめる（detach）。描画中なら、その描画を失敗で終える
Detach ==
  /\ Active
  /\ state' = "idle" /\ run' = 0
  /\ result' = Failing
  /\ UNCHANGED <<runs, accepted>>

Dispose ==
  /\ state' = "disposed" /\ run' = 0
  /\ result' = Failing
  /\ UNCHANGED <<runs, accepted>>

Next == Ready \/ Render \/ RenderRefused \/ Receive \/ Timeout \/ Detach \/ Dispose

Spec == Init /\ [][Next]_vars /\ WF_vars(Timeout)

-----------------------------------------------------------------------------
\* 描画・表示していることと、実行 ID を持っていることは一致する
ActiveHasRun == Active <=> (run # 0)

\* 完了を待っている描画は、いま描画中の 1 件だけ（待ったままの描画を残さない）
PendingIsCurrentRender == \A id \in 1..MaxRuns : (result[id] = "pending") <=> (state = "rendering" /\ run = id)

\* 受け付けるのは、いまの描画・表示のメッセージだけ（古い実行 ID のメッセージは破棄する）
OnlyCurrentAccepted == \A message \in accepted : message.from = message.at

\* 一度決まった描画の結果は変わらない
SettledOnce ==
  [][\A id \in 1..MaxRuns : result[id] \in {"done", "failed"} => result'[id] = result[id]]_vars

\* 破棄したら、どの状態へも戻らない
DisposedIsFinal == [][state = "disposed" => state' = "disposed"]_vars

\* 頼んだ描画は、いつか結果か失敗を受け取る
EveryRenderSettles == \A id \in 1..MaxRuns : (result[id] = "pending") ~> (result[id] \in {"done", "failed"})
=============================================================================
