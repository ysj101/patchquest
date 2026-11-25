----------------------------- MODULE Navigation -----------------------------
(***************************************************************************)
(* 学習UIの画面の切り替え（platform/ui/app.ts と platform/ui/screen.ts）と *)
(* 演習の開始前チェックの組み合わせのモデル。                              *)
(*                                                                         *)
(* 画面の遷移表は SCREEN_MACHINE と同じ。tests/unit/formal-models.test.ts  *)
(* が、この Moves と表の一致を確かめる。                                   *)
(*                                                                         *)
(* 課題を始める（begin）と開始前チェックの画面へ移り、合格したら演習画面   *)
(* へ進む。点検は時間がかかるので、その間に一覧へ戻ることも、別の課題を    *)
(* 始めることもできる。古い点検の続きが、いまの画面を動かさないことを      *)
(* 検査する。                                                              *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS MaxAttempts  \* 課題を始める回数の上限

Screens == {"list", "records", "preflight", "exercise"}

\* いまの画面 → 移れる画面（SCREEN_MACHINE）
Moves ==
  { <<"list", "list">>, <<"list", "records">>, <<"list", "preflight">>,
    <<"records", "list">>, <<"records", "records">>, <<"records", "preflight">>,
    <<"preflight", "list">>, <<"preflight", "records">>, <<"preflight", "preflight">>, <<"preflight", "exercise">>,
    <<"exercise", "list">>, <<"exercise", "records">>, <<"exercise", "preflight">> }

VARIABLES
  screen,    \* いまの画面
  attempt,   \* いまの演習の番号。0 は始めていない
  check,     \* いまの演習の開始前チェック："none"・"running"・"ready"（合格して演習中）・"blocked"
  aborting,  \* 別の演習が始まったので、開始前チェックを打ち切っている途中の演習の番号
  settled,   \* 開始（start）が終わり、続き（enterIfReady）を待っている演習の番号
  entered,   \* 演習画面に出している演習の番号。0 は出していない
  error      \* 遷移表にない画面の切り替えを起こそうとしたか

vars == <<screen, attempt, check, aborting, settled, entered, error>>

TypeOK ==
  /\ screen \in Screens
  /\ attempt \in 0..MaxAttempts
  /\ check \in {"none", "running", "ready", "blocked"}
  /\ aborting \subseteq 1..MaxAttempts
  /\ settled \subseteq 1..MaxAttempts
  /\ entered \in 0..MaxAttempts
  /\ error \in BOOLEAN

Init ==
  /\ screen = "list" /\ attempt = 0 /\ check = "none"
  /\ aborting = {} /\ settled = {} /\ entered = 0 /\ error = FALSE

\* 画面を切り替える（show）。遷移表にない切り替えは失敗する
Show(to) ==
  /\ screen' = IF <<screen, to>> \in Moves THEN to ELSE screen
  /\ error' = (error \/ <<screen, to>> \notin Moves)

\* 課題を始める（begin）。一覧・URL・振り返りの「もう一度」のどこからでも始められる。
\* 前の演習が開始前チェックの途中なら、そのチェックは打ち切られる
Begin ==
  /\ attempt < MaxAttempts
  /\ attempt' = attempt + 1
  /\ check' = "running"
  /\ aborting' = IF check = "running" THEN aborting \cup {attempt} ELSE aborting
  /\ Show("preflight")
  /\ entered' = 0
  /\ UNCHANGED settled

\* いまの演習の開始前チェックが終わる（合格か、開始不可）
CheckDone ==
  /\ check = "running"
  /\ \E outcome \in {"ready", "blocked"} : check' = outcome
  /\ settled' = settled \cup {attempt}
  /\ UNCHANGED <<screen, attempt, aborting, entered, error>>

\* 打ち切られた開始前チェックが終わり、前の演習の開始（start）が終わる。その続きも enterIfReady へ進もうとする
StaleDone ==
  /\ \E old \in aborting :
       /\ aborting' = aborting \ {old}
       /\ settled' = settled \cup {old}
  /\ UNCHANGED <<screen, attempt, check, entered, error>>

(***************************************************************************)
(* 開始前チェックの続き（enterIfReady）。開始前チェックの画面にいて、      *)
(* いまの演習の続きであり、合格しているときだけ、演習画面へ進む。          *)
(***************************************************************************)
EnterIfReady(id) ==
  /\ id \in settled
  /\ settled' = settled \ {id}
  /\ IF screen = "preflight" /\ id = attempt /\ check = "ready"
       THEN Show("exercise") /\ entered' = id
       ELSE UNCHANGED <<screen, entered, error>>
  /\ UNCHANGED <<attempt, check, aborting>>

\* 開始不可のあと、もう一度チェックする（開始前チェックの画面のボタン）
Retry ==
  /\ screen = "preflight" /\ check = "blocked"
  /\ check' = "running"
  /\ UNCHANGED <<screen, attempt, aborting, settled, entered, error>>

\* 課題一覧・記録へ移る（どの画面からでも。演習は止める）
Leave ==
  /\ \E to \in {"list", "records"} : Show(to)
  /\ entered' = 0
  /\ UNCHANGED <<attempt, check, aborting, settled>>

Next ==
  \/ Begin \/ CheckDone \/ StaleDone \/ Retry \/ Leave
  \/ \E id \in 1..MaxAttempts : EnterIfReady(id)

Spec == Init /\ [][Next]_vars /\ \A id \in 1..MaxAttempts : WF_vars(EnterIfReady(id))

-----------------------------------------------------------------------------
\* 遷移表にない画面の切り替えは起こさない
NoBadMove == ~error

\* 演習画面に出しているのは、開始前チェックに合格した、いまの演習である
ExerciseShowsReadyAttempt == (screen = "exercise") => (entered = attempt /\ check = "ready")

\* 演習画面にいないときは、演習を出していない
EnteredOnlyOnExercise == (entered # 0) => (screen = "exercise")

\* 演習画面へは、開始前チェックの画面からだけ入る
EnterOnlyFromPreflight == [][(screen' = "exercise" /\ screen # "exercise") => screen = "preflight"]_vars

\* 開始前チェックの画面にいて合格したら、ほかへ移らないかぎり、いつか演習画面へ進む
ReadyEnters == (screen = "preflight" /\ check = "ready") ~> (screen # "preflight")
=============================================================================
