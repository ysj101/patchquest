------------------------------ MODULE Runtime ------------------------------
(***************************************************************************)
(* ブラウザ用の実行環境（runtimes/browser/adapter.ts）の状態と、Worker へ  *)
(* の呼び出しのモデル。                                                    *)
(*                                                                         *)
(* 状態は idle（まだ準備していない）、ready（Worker が動いている）、       *)
(* halted（停止・時間切れ・異常終了・準備の失敗で Worker を捨てた）、      *)
(* disposed（破棄した）。呼び出しは ready のときだけ Worker へ送り、       *)
(* Worker を捨てるときは、応答を待っている呼び出しをすべて失敗させる。     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxCalls,    \* 呼び出しの回数の上限（準備の呼び出しを含む）
  MaxWorkers   \* 起動する Worker の数の上限

VARIABLES
  phase,    \* 実行環境の状態
  worker,   \* 動いている Worker の番号。0 は動いていない
  workers,  \* これまでに起動した Worker の数
  pending,  \* 応答を待っている呼び出し。[id, worker, prepare] の集合
  outcome,  \* 呼び出しごとの結果
  calls     \* これまでの呼び出しの回数

vars == <<phase, worker, workers, pending, outcome, calls>>

Phases == {"idle", "ready", "halted", "disposed"}
\* none: まだ呼んでいない / pending: 応答を待っている / resolved: 結果を返した / rejected: 失敗を返した
Outcomes == {"none", "pending", "resolved", "rejected"}

TypeOK ==
  /\ phase \in Phases
  /\ worker \in 0..MaxWorkers /\ workers \in 0..MaxWorkers
  /\ pending \subseteq [id : 1..MaxCalls, worker : 1..MaxWorkers, prepare : BOOLEAN]
  /\ outcome \in [1..MaxCalls -> Outcomes]
  /\ calls \in 0..MaxCalls

Init ==
  /\ phase = "idle" /\ worker = 0 /\ workers = 0
  /\ pending = {} /\ calls = 0
  /\ outcome = [id \in 1..MaxCalls |-> "none"]

Ids(set) == {call.id : call \in set}

\* 呼び出しの集合を失敗させたあとの結果
Rejecting(set) == [id \in 1..MaxCalls |-> IF id \in Ids(set) THEN "rejected" ELSE outcome[id]]

(***************************************************************************)
(* 準備する（prepare）。演習用の機械を使う同じアプリを準備し直すときは     *)
(* Worker を使い回し（reuse）、応答を待っている呼び出しもそのまま残る。    *)
(* それ以外は Worker を作り直し、待っている呼び出しを失敗させる。          *)
(* 準備そのものも Worker への呼び出し（prepare が TRUE）として待つ。       *)
(***************************************************************************)
Prepare ==
  /\ phase \in {"idle", "ready", "halted"}
  /\ calls < MaxCalls
  /\ calls' = calls + 1
  /\ phase' = "ready"
  /\ \E reuse \in BOOLEAN :
       /\ reuse => phase = "ready"
       /\ ~reuse => workers < MaxWorkers
       /\ worker' = IF reuse THEN worker ELSE workers + 1
       /\ workers' = IF reuse THEN workers ELSE workers + 1
       /\ LET kept == IF reuse THEN pending ELSE {}
              base == IF reuse THEN outcome ELSE Rejecting(pending)
          IN /\ pending' = kept \cup {[id |-> calls + 1, worker |-> worker', prepare |-> TRUE]}
             /\ outcome' = [base EXCEPT ![calls + 1] = "pending"]

\* 教材ロジックを呼び出す（invoke・setImplementation・reset）。ready でなければ、Worker へ送らずに断る
Call ==
  /\ calls < MaxCalls
  /\ calls' = calls + 1
  /\ IF phase = "ready"
       THEN /\ pending' = pending \cup {[id |-> calls + 1, worker |-> worker, prepare |-> FALSE]}
            /\ outcome' = [outcome EXCEPT ![calls + 1] = "pending"]
       ELSE /\ outcome' = [outcome EXCEPT ![calls + 1] = "rejected"]
            /\ UNCHANGED pending
  /\ UNCHANGED <<phase, worker, workers>>

\* Worker が結果を返す
ReplyOk ==
  \E call \in pending :
    /\ pending' = pending \ {call}
    /\ outcome' = [outcome EXCEPT ![call.id] = "resolved"]
    /\ UNCHANGED <<phase, worker, workers, calls>>

\* Worker を捨てたあとの状態（halt）。ready のときだけ halted へ移る
Halted == IF phase = "ready" THEN "halted" ELSE phase

\* Worker が失敗を返す。準備の失敗なら Worker を捨て、残りの呼び出しも失敗させる
ReplyError ==
  \E call \in pending :
    IF call.prepare
      THEN /\ pending' = {} /\ outcome' = Rejecting(pending)
           /\ phase' = Halted /\ worker' = 0
           /\ UNCHANGED <<workers, calls>>
      ELSE /\ pending' = pending \ {call}
           /\ outcome' = [outcome EXCEPT ![call.id] = "rejected"]
           /\ UNCHANGED <<phase, worker, workers, calls>>

\* 呼び出しの時間切れ・停止（stop）・Worker の異常終了。Worker を捨て、待っている呼び出しをすべて失敗させる
Halt ==
  /\ phase # "disposed"
  /\ pending' = {} /\ outcome' = Rejecting(pending)
  /\ phase' = Halted /\ worker' = 0
  /\ UNCHANGED <<workers, calls>>

\* 時間切れは、応答を待っている呼び出しがあるときに起きる
Timeout == pending # {} /\ Halt

Dispose ==
  /\ pending' = {} /\ outcome' = Rejecting(pending)
  /\ phase' = "disposed" /\ worker' = 0
  /\ UNCHANGED <<workers, calls>>

Next == Prepare \/ Call \/ ReplyOk \/ ReplyError \/ Halt \/ Dispose

Spec == Init /\ [][Next]_vars /\ WF_vars(Timeout)

-----------------------------------------------------------------------------
\* ready であることと、Worker が動いていることは一致する
ReadyHasWorker == (phase = "ready") <=> (worker # 0)

\* 応答を待つ呼び出しがあるのは ready のときだけで、すべて、いま動いている Worker への呼び出しである
PendingOnLiveWorker == \A call \in pending : phase = "ready" /\ call.worker = worker

\* 呼び出しの結果と、応答を待っている呼び出しは食い違わない（待ったままの呼び出しを残さない）
OutcomeMatchesPending == \A id \in 1..MaxCalls : (outcome[id] = "pending") <=> (id \in Ids(pending))

\* 準備していない・止めた・破棄した実行環境では、何も待っていない
NothingPendingUnlessReady == (phase # "ready") => (pending = {})

\* 一度決まった結果は変わらない（結果を返したあとで失敗にしたり、その逆にしたりしない）
SettledOnce ==
  [][\A id \in 1..MaxCalls : outcome[id] \in {"resolved", "rejected"} => outcome'[id] = outcome[id]]_vars

\* 破棄したら、どの状態へも戻らない
DisposedIsFinal == [][phase = "disposed" => phase' = "disposed"]_vars

\* 準備していない状態（idle）へは戻らない
NeverBackToIdle == [][phase # "idle" => phase' # "idle"]_vars

\* 応答を待っている呼び出しは、いつか結果か失敗を受け取る
EveryCallSettles == \A id \in 1..MaxCalls : (outcome[id] = "pending") ~> (outcome[id] \in {"resolved", "rejected"})
=============================================================================
