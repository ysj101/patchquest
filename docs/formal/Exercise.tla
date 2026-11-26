------------------------------ MODULE Exercise ------------------------------
(***************************************************************************)
(* 演習の進行（platform/orchestrator/orchestrator.ts）のモデル。           *)
(*                                                                         *)
(* 状態遷移表は platform/contract/attempt.ts の EXERCISE_MACHINE と同じ。  *)
(* tests/unit/formal-models.test.ts が、この Transitions と表の一致を      *)
(* 確かめる。                                                              *)
(*                                                                         *)
(* 進行役の処理は await で区切られる。区切りの間に別の操作が割り込めるの   *)
(* で、検証（開始と終了）、構成の変更（順番待ち・開始・終了）を別々の      *)
(* 動作として書き、すべての割り込み方を検査する。                          *)
(*                                                                         *)
(* モデルにしていないこと：演習用インスタンスの中のデータ（初期化と、      *)
(* 届く途中のやり取りの前後関係）、検証の合否と構成の対応（合否は任意）。  *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  MaxAttempts,  \* 演習を始める（始め直す）回数の上限
  Budget        \* 構成を変える操作（対策の切り替え・修正の記録・初期化）の回数の上限

States == {"Selected", "Preflight", "Prepared", "Explored", "Repairing", "Verifying", "Passed", "Blocked"}

Events == {"preflight-started", "preflight-passed", "preflight-blocked", "explored", "repair-changed",
           "verification-started", "verification-settled", "completed", "reset"}

\* 状態 × 出来事 → 次の状態（EXERCISE_MACHINE）
Transitions ==
  { <<"Selected", "preflight-started", "Preflight">>,
    <<"Preflight", "preflight-passed", "Prepared">>,
    <<"Preflight", "preflight-blocked", "Blocked">>,
    <<"Prepared", "explored", "Explored">>,
    <<"Prepared", "repair-changed", "Repairing">>,
    <<"Explored", "repair-changed", "Repairing">>,
    <<"Explored", "reset", "Prepared">>,
    <<"Repairing", "repair-changed", "Repairing">>,
    <<"Repairing", "verification-started", "Verifying">>,
    <<"Repairing", "completed", "Passed">>,
    <<"Repairing", "reset", "Prepared">>,
    <<"Verifying", "repair-changed", "Verifying">>,
    <<"Verifying", "verification-settled", "Repairing">>,
    <<"Verifying", "completed", "Passed">>,
    <<"Passed", "repair-changed", "Repairing">>,
    <<"Passed", "verification-started", "Verifying">>,
    <<"Passed", "reset", "Prepared">>,
    <<"Blocked", "preflight-started", "Preflight">> }

\* その状態で出来事を起こせるか（nextExerciseState が undefined でないか）
Defined(s, e) == \E t \in Transitions : t[1] = s /\ t[2] = e

After(s, e) == (CHOOSE t \in Transitions : t[1] = s /\ t[2] = e)[3]

\* 起こせない出来事では状態を変えない（実装では dispatch が失敗する。error に記録して検査する）
Dispatch(s, e) == IF Defined(s, e) THEN After(s, e) ELSE s

\* 演習中か（isInExercise）
InExercise(s) == Defined(s, "repair-changed")

VARIABLES
  attempt,         \* いまの演習の番号。start のたびに増える。0 はまだ始めていない
  state,           \* いまの演習の状態
  config,          \* いまの構成の版（configHash の抽象）。構成が変わるたびに増える
  verified,        \* 最後に合格した検証が確かめた構成の版。NoVersion はまだ合格していない
  applied,         \* 対策を適用しているか（appliedDefense が null でないか）
  logged,          \* 修正の記録（repairLog）があるか
  repro,           \* 再現の達成印
  defense,         \* 防御の達成印（記録上）
  understanding,   \* 理解の達成印
  defenseCurrent,  \* 防御の達成印が、現在の構成を検証して得たものか
  blocked,         \* 開始できない理由（snapshot.blocked）があるか
  runs,            \* 実行中の検証。[attempt, config] の集合。前の演習の検証が残ることがある
  queue,           \* 順番を待っている構成の変更（Orchestrator.changes）
  changing,        \* 実行中の構成の変更（await の途中）。NoChange は実行していない
  budget,          \* 構成を変える操作の残り回数
  error            \* 処理の途中で、起こせない出来事を起こそうとしたか

vars == <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
          defenseCurrent, blocked, runs, queue, changing, budget, error>>

NoVersion == Budget + 1
NoChange == [kind |-> "none", attempt |-> 0]
RequestKinds == {"apply", "revert", "reset"}
ChangeKinds == RequestKinds \cup {"record"}
Changes == [kind : ChangeKinds, attempt : 1..MaxAttempts]

TypeOK ==
  /\ attempt \in 0..MaxAttempts
  /\ state \in States
  /\ config \in 0..Budget
  /\ verified \in 0..NoVersion
  /\ applied \in BOOLEAN /\ logged \in BOOLEAN
  /\ repro \in BOOLEAN /\ defense \in BOOLEAN /\ understanding \in BOOLEAN
  /\ defenseCurrent \in BOOLEAN /\ blocked \in BOOLEAN
  /\ runs \subseteq [attempt : 1..MaxAttempts, config : 0..Budget]
  /\ queue \in Seq(Changes)
  /\ changing \in Changes \cup {NoChange}
  /\ budget \in 0..Budget
  /\ error \in BOOLEAN

Init ==
  /\ attempt = 0 /\ state = "Selected" /\ config = 0 /\ verified = NoVersion
  /\ applied = FALSE /\ logged = FALSE
  /\ repro = FALSE /\ defense = FALSE /\ understanding = FALSE
  /\ defenseCurrent = FALSE /\ blocked = FALSE
  /\ runs = {} /\ queue = <<>> /\ changing = NoChange
  /\ budget = Budget /\ error = FALSE

AllBadges(current, understood) == repro /\ current /\ understood

(***************************************************************************)
(* 演習を始める（start）。続きから（resume）なら達成印を引き継ぐ。         *)
(* 検証の現在性・対策・修正の記録は引き継がない。前の演習の検証と構成の    *)
(* 変更は、実行中・順番待ちのまま残る。                                    *)
(***************************************************************************)
Start ==
  /\ attempt < MaxAttempts
  /\ \E resume \in BOOLEAN :
       /\ repro' = (resume /\ repro)
       /\ defense' = (resume /\ defense)
       /\ understanding' = (resume /\ understanding)
  /\ attempt' = attempt + 1
  /\ state' = "Preflight"
  /\ config' = 0 /\ verified' = NoVersion
  /\ applied' = FALSE /\ logged' = FALSE
  /\ defenseCurrent' = FALSE /\ blocked' = FALSE
  /\ UNCHANGED <<runs, queue, changing, budget, error>>

\* 事前検証が終わる（runPreflight の await のあと）。演習が入れ替わっていれば、いまの演習には触れない
PreflightPassed ==
  /\ attempt > 0 /\ state = "Preflight"
  /\ state' = Dispatch(state, "preflight-passed")
  /\ UNCHANGED <<attempt, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, queue, changing, budget, error>>

PreflightBlocked ==
  /\ attempt > 0 /\ state = "Preflight"
  /\ state' = Dispatch(state, "preflight-blocked")
  /\ blocked' = TRUE
  /\ UNCHANGED <<attempt, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, runs, queue, changing, budget, error>>

\* 事前検証をやり直す（retryPreflight）。起こせない状態では、何も変えずに断る
RetryPreflight ==
  /\ attempt > 0 /\ Defined(state, "preflight-started")
  /\ state' = After(state, "preflight-started")
  /\ blocked' = FALSE
  /\ UNCHANGED <<attempt, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, runs, queue, changing, budget, error>>

(***************************************************************************)
(* プレイヤーのやり取りを観測する（onExchange）。現在の演習が発行した      *)
(* 実行 ID のやり取りだけがここへ来る。再現にあたることも、修正の記録に    *)
(* なる（recorded）こともある。修正の記録は、構成の変更として順番待ちの    *)
(* 列に入る。検証中でも届く。再現で達成印がそろえば Passed にする。        *)
(***************************************************************************)
Exchange ==
  /\ attempt > 0 /\ InExercise(state)
  /\ \E reproduced \in BOOLEAN, recorded \in BOOLEAN :
       /\ recorded => budget > 0
       /\ repro' = (repro \/ reproduced)
       /\ queue' = IF recorded THEN Append(queue, [kind |-> "record", attempt |-> attempt]) ELSE queue
       /\ budget' = IF recorded THEN budget - 1 ELSE budget
       /\ state' = IF state = "Prepared" THEN After(state, "explored")
                    ELSE IF (repro \/ reproduced) /\ defenseCurrent /\ understanding /\ state = "Repairing"
                      THEN After(state, "completed")
                    ELSE state
  /\ UNCHANGED <<attempt, config, verified, applied, logged, defense, understanding,
                 defenseCurrent, blocked, runs, changing, error>>

\* 対策の切り替え（apply・revert）と初期化（reset）を頼む。順番待ちの列に入るだけ
Request ==
  /\ attempt > 0 /\ budget > 0
  /\ \E kind \in RequestKinds : queue' = Append(queue, [kind |-> kind, attempt |-> attempt])
  /\ budget' = budget - 1
  /\ UNCHANGED <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, changing, error>>

\* 順番が来たが、頼んだあとで別の演習が始まっていた。実行しない
SkipStaleChange ==
  /\ changing = NoChange /\ queue # <<>>
  /\ Head(queue).attempt # attempt
  /\ queue' = Tail(queue)
  /\ UNCHANGED <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, changing, budget, error>>

\* 対策の切り替えを始められる状態か（演習中で、検証中でない）
CanSwitch == InExercise(state) /\ state # "Verifying"

\* 順番が来たが、いまの状態では受け付けない（検証中の対策の切り替え・初期化など）。何も変えずに断る
RejectChange ==
  /\ changing = NoChange /\ queue # <<>>
  /\ Head(queue).attempt = attempt
  /\ \/ Head(queue).kind = "reset" /\ ~Defined(state, "reset")
     \/ Head(queue).kind \in {"apply", "revert"} /\ ~CanSwitch
  /\ queue' = Tail(queue)
  /\ UNCHANGED <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, changing, budget, error>>

\* 対策の切り替えを始める（setDefense）。実装の切り替えが終わるまで、状態は変えない
SwitchBegin ==
  /\ changing = NoChange /\ queue # <<>>
  /\ Head(queue).attempt = attempt
  /\ Head(queue).kind \in {"apply", "revert"}
  /\ CanSwitch
  /\ changing' = Head(queue)
  /\ queue' = Tail(queue)
  /\ UNCHANGED <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, budget, error>>

\* 対策の切り替えが終わる。切り替えている間に別の演習が始まっていたら、その演習の状態は動かさない
SwitchEnd ==
  /\ changing.kind \in {"apply", "revert"}
  /\ changing' = NoChange
  /\ IF changing.attempt = attempt
       THEN /\ applied' = (changing.kind = "apply")
            /\ config' = config + 1
            /\ defenseCurrent' = FALSE
            /\ state' = Dispatch(state, "repair-changed")
            /\ error' = (error \/ ~Defined(state, "repair-changed"))
       ELSE UNCHANGED <<applied, config, defenseCurrent, state, error>>
  /\ UNCHANGED <<attempt, verified, logged, repro, defense, understanding, blocked, runs, queue, budget>>

\* 修正の記録を始める（recordRepair）。構成のハッシュを計算し終えるまで、何も書き換えない
RecordBegin ==
  /\ changing = NoChange /\ queue # <<>>
  /\ Head(queue).attempt = attempt
  /\ Head(queue).kind = "record"
  /\ changing' = Head(queue)
  /\ queue' = Tail(queue)
  /\ UNCHANGED <<attempt, state, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, budget, error>>

\* 修正の記録・構成のハッシュ・状態をまとめて書き換える。検証中なら、検証中のまま留まる
RecordEnd ==
  /\ changing.kind = "record"
  /\ changing' = NoChange
  /\ IF changing.attempt = attempt
       THEN /\ logged' = TRUE
            /\ config' = config + 1
            /\ defenseCurrent' = FALSE
            /\ state' = Dispatch(state, "repair-changed")
            /\ error' = (error \/ ~Defined(state, "repair-changed"))
       ELSE UNCHANGED <<logged, config, defenseCurrent, state, error>>
  /\ UNCHANGED <<attempt, verified, applied, repro, defense, understanding, blocked, runs, queue, budget>>

\* 初期化の前に届いて順番を待っていた修正の記録。初期化で実行 ID が無効になるので、順番が来ても記録しない
StaleRecord(change) == change.kind = "record" /\ change.attempt = attempt

\* 初期化を始める（resetToInitial）。実装とデータを戻し終える前に、状態を先に戻す
ResetBegin ==
  /\ changing = NoChange /\ queue # <<>>
  /\ Head(queue).attempt = attempt
  /\ Head(queue).kind = "reset"
  /\ Defined(state, "reset")
  /\ changing' = Head(queue)
  /\ queue' = SelectSeq(Tail(queue), LAMBDA change : ~StaleRecord(change))
  /\ state' = After(state, "reset")
  /\ applied' = FALSE /\ logged' = FALSE /\ defenseCurrent' = FALSE
  /\ UNCHANGED <<attempt, config, verified, repro, defense, understanding, blocked, runs, budget, error>>

\* 初期化が終わる（実装とデータを戻し終え、構成のハッシュを計算し直す）
ResetEnd ==
  /\ changing.kind = "reset"
  /\ changing' = NoChange
  /\ config' = IF changing.attempt = attempt THEN config + 1 ELSE config
  /\ UNCHANGED <<attempt, state, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, runs, queue, budget, error>>

\* 検証を始める（verify）。始められない状態では、何も変えずに断る
VerifyStart ==
  /\ attempt > 0 /\ Defined(state, "verification-started")
  /\ state' = After(state, "verification-started")
  /\ runs' = runs \cup {[attempt |-> attempt, config |-> config]}
  /\ UNCHANGED <<attempt, config, verified, applied, logged, repro, defense, understanding,
                 defenseCurrent, blocked, queue, changing, budget, error>>

(***************************************************************************)
(* 検証が終わる。別の演習が始まっていたら結果を捨てる。合格（pass）なら    *)
(* 防御の達成印を付け、確かめた構成がいまの構成と同じときだけ、現在の      *)
(* 合格として扱う。基盤エラー（error）は不合格に数えず、現在性も変えない。 *)
(***************************************************************************)
VerifyEnd ==
  \E run \in runs, outcome \in {"pass", "fail", "error"} :
    /\ runs' = runs \ {run}
    /\ IF run.attempt = attempt
         THEN LET passed == outcome = "pass"
                  current == IF outcome = "error" THEN defenseCurrent ELSE passed /\ run.config = config
                  event == IF AllBadges(current, understanding) THEN "completed" ELSE "verification-settled"
              IN /\ defense' = (defense \/ passed)
                 /\ defenseCurrent' = current
                 /\ verified' = IF passed THEN run.config ELSE verified
                 /\ state' = Dispatch(state, event)
                 /\ error' = (error \/ ~Defined(state, event))
         ELSE UNCHANGED <<defense, defenseCurrent, verified, state, error>>
    /\ UNCHANGED <<attempt, config, applied, logged, repro, understanding, blocked, queue, changing, budget>>

\* 理解確認に答える（answerTransfer）。達成印がそろい、検証中でなければ Passed にする
Answer ==
  /\ attempt > 0
  /\ \E correct \in BOOLEAN :
       LET understood == understanding \/ correct
       IN /\ understanding' = understood
          /\ state' = IF AllBadges(defenseCurrent, understood) /\ state = "Repairing"
                        THEN After(state, "completed") ELSE state
  /\ UNCHANGED <<attempt, config, verified, applied, logged, repro, defense, defenseCurrent,
                 blocked, runs, queue, changing, budget, error>>

Next ==
  \/ Start \/ PreflightPassed \/ PreflightBlocked \/ RetryPreflight
  \/ Exchange \/ Request
  \/ SkipStaleChange \/ RejectChange \/ SwitchBegin \/ SwitchEnd \/ RecordBegin \/ RecordEnd \/ ResetBegin \/ ResetEnd
  \/ VerifyStart \/ VerifyEnd \/ Answer

Spec == Init /\ [][Next]_vars /\ WF_vars(VerifyEnd)

-----------------------------------------------------------------------------
\* いまの演習の、実行中の検証
CurrentRuns == {run \in runs : run.attempt = attempt}

\* 処理の途中で、遷移表にない出来事を起こそうとしない
NoFailedDispatch == ~error

\* 検証中（Verifying）であることと、いまの演習の検証が実行中であることは一致する。検証は重ならない
VerifyingMatchesRun ==
  /\ (state = "Verifying") <=> (CurrentRuns # {})
  /\ Cardinality(CurrentRuns) <= 1

\* 検証中に、初期化は実行していない（初期化の途中に検証は始まらない）
NoResetWhileVerifying ==
  (state = "Verifying" /\ changing.attempt = attempt) => changing.kind # "reset"

\* Passed は、再現・防御（現在の構成）・理解がそろっているときだけ
PassedMeansAllBadges == (state = "Passed") => (repro /\ defense /\ understanding /\ defenseCurrent)

\* 達成印がそろったまま Passed でないのは、検証し直している間だけ
AllBadgesMeansPassed == AllBadges(defenseCurrent, understanding) => state \in {"Passed", "Verifying"}

\* 現在の合格は、いまの構成を確かめた合格に限る（spec §5.3）
CurrentMeansVerified == defenseCurrent => (defense /\ verified = config)

\* 脆弱な初期状態（Prepared・Explored）では、対策も修正の記録も現在の合格もない
InitialMeansUntouched == (state \in {"Prepared", "Explored"}) => (~applied /\ ~logged /\ ~defenseCurrent)

\* 開始できない理由があるのは Blocked のときだけ
BlockedMatchesReason == blocked <=> (state = "Blocked")

\* 演習を始める前は Selected のまま
NotStartedIsSelected == (attempt = 0) => (state = "Selected")

\* 始めた検証は、いつか終わって検証中を抜ける
VerifyingEnds == (state = "Verifying") ~> (state # "Verifying")
=============================================================================
