----------------------------- MODULE Evaluator -----------------------------
(***************************************************************************)
(* 評価器（platform/evaluator/evaluator.ts）の、検証インスタンスと検証の   *)
(* 順番のモデル。                                                          *)
(*                                                                         *)
(* 検証インスタンスは none（まだ作っていない）、started（作ったが、どの    *)
(* 構成も準備していない）、prepared（ある構成を準備してある）。検証は      *)
(* 1 件ずつ順に行い、新しい検証が頼まれたら、古い検証は結果を返さずに      *)
(* 終える。実行環境が止まったら（時間切れなど）、次のテストの前に準備し    *)
(* 直す。                                                                  *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  MaxJobs,   \* 検証を頼む回数の上限
  Configs,   \* 検証する構成
  Tests      \* 検証 1 件あたりのテストの数

VARIABLES
  instance,    \* 検証インスタンスの状態
  key,         \* 準備してある構成。NoConfig は準備していない
  generation,  \* 頼まれた検証の通し番号（いちばん新しい検証の番号）
  queue,       \* 順番を待っている検証
  active,      \* 実行中の検証。NoJob は実行していない
  left,        \* 実行中の検証の、残りのテストの数
  ran,         \* 実行したテストの記録。[job, wanted, on]（頼まれた構成と、実際に準備されていた構成）
  reported     \* 結果を返した検証の番号

vars == <<instance, key, generation, queue, active, left, ran, reported>>

NoConfig == "none"
ASSUME NoConfig \notin Configs

NoJob == [id |-> 0, config |-> NoConfig]
Jobs == [id : 1..MaxJobs, config : Configs]

TypeOK ==
  /\ instance \in {"none", "started", "prepared"}
  /\ key \in Configs \cup {NoConfig}
  /\ generation \in 0..MaxJobs
  /\ queue \in Seq(Jobs)
  /\ active \in Jobs \cup {NoJob}
  /\ left \in 0..Tests
  /\ ran \subseteq [job : 1..MaxJobs, wanted : Configs, on : Configs]
  /\ reported \subseteq 1..MaxJobs

Init ==
  /\ instance = "none" /\ key = NoConfig /\ generation = 0
  /\ queue = <<>> /\ active = NoJob /\ left = 0
  /\ ran = {} /\ reported = {}

\* 検証を頼む（runSuite・runProbes）。これより前に頼まれた検証は古くなる
Request ==
  /\ generation < MaxJobs
  /\ \E config \in Configs : queue' = Append(queue, [id |-> generation + 1, config |-> config])
  /\ generation' = generation + 1
  /\ UNCHANGED <<instance, key, active, left, ran, reported>>

\* 前の検証が終わり、次の検証の番が来る
Begin ==
  /\ active = NoJob /\ queue # <<>>
  /\ active' = Head(queue) /\ queue' = Tail(queue)
  /\ left' = Tests
  /\ UNCHANGED <<instance, key, generation, ran, reported>>

Current == active # NoJob /\ active.id = generation

\* 新しい検証が頼まれていたら、結果を返さずに終える（テストの前後で確かめる）
Abort ==
  /\ active # NoJob /\ active.id # generation
  /\ active' = NoJob /\ left' = 0
  /\ UNCHANGED <<instance, key, generation, queue, ran, reported>>

\* 検証インスタンスを作る
Create ==
  /\ Current /\ left > 0 /\ instance = "none"
  /\ instance' = "started"
  /\ UNCHANGED <<key, generation, queue, active, left, ran, reported>>

NeedsPrepare == instance = "started" \/ (instance = "prepared" /\ key # active.config)

\* 検証する構成を準備する。準備に失敗したら、そのテストは判定不能にし、前の構成が残っているとは見なさない
Prepare ==
  /\ Current /\ left > 0 /\ NeedsPrepare
  /\ \/ instance' = "prepared" /\ key' = active.config /\ UNCHANGED left
     \/ instance' = "started" /\ key' = NoConfig /\ left' = left - 1
  /\ UNCHANGED <<generation, queue, active, ran, reported>>

\* テストを 1 件実行する。実行環境が止まったら（時間切れなど）、次のテストの前に準備し直す
RunTest ==
  /\ Current /\ left > 0 /\ instance = "prepared" /\ key = active.config
  /\ ran' = ran \cup {[job |-> active.id, wanted |-> active.config, on |-> key]}
  /\ left' = left - 1
  /\ \/ UNCHANGED <<instance, key>>
     \/ instance' = "started" /\ key' = NoConfig
  /\ UNCHANGED <<generation, queue, active, reported>>

\* すべてのテストを終え、結果を返す
Report ==
  /\ Current /\ left = 0
  /\ reported' = reported \cup {active.id}
  /\ active' = NoJob
  /\ UNCHANGED <<instance, key, generation, queue, left, ran>>

Next == Request \/ Begin \/ Abort \/ Create \/ Prepare \/ RunTest \/ Report

Spec == Init /\ [][Next]_vars /\ WF_vars(Begin \/ Abort \/ Create \/ Prepare \/ RunTest \/ Report)

-----------------------------------------------------------------------------
\* 準備してある構成があるのは prepared のときだけ
KeyMatchesInstance == (instance = "prepared") <=> (key # NoConfig)

\* テストは、頼まれた構成を準備したインスタンスでだけ実行する（古い構成のまま検証しない）
TestsRunOnWantedConfig == \A test \in ran : test.on = test.wanted

\* 結果を返すのは、その時点でいちばん新しい検証だけ（古い検証は結果を返さない）
OnlyLatestReports == [][\A id \in reported' \ reported : id = generation]_vars

\* 頼まれた検証は、いつかすべて終わる（結果を返すか、古くなって終える）
Settles == <>[](queue = <<>> /\ active = NoJob)
=============================================================================
