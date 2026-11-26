------------------------------- MODULE Guide -------------------------------
(***************************************************************************)
(* 操作ガイド（platform/ui/guide.ts の GuidePanel）のモデル。              *)
(*                                                                         *)
(* ガイドは off（ガイドのないパック、または演習が始まっていない）、        *)
(* guiding（案内している）、closed（プレイヤーが閉じた）のどれか。         *)
(* guiding のときだけ、出来事（ステップの達成）と「飛ばす」を受け付ける。  *)
(* 別の演習が始まると、最初から始め直す。                                  *)
(* ステップ i は、出来事 i が起きると済みになる（ステップと出来事を 1 対 1 *)
(* に単純化している）。                                                    *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Steps,       \* ガイドのステップの数
  MaxAttempts  \* 演習を始める回数の上限

VARIABLES
  mode,     \* ガイドの状態
  attempt,  \* ガイドしている演習の番号。0 はまだない
  reached,  \* 起きた出来事
  skipped   \* 飛ばしたステップ

vars == <<mode, attempt, reached, skipped>>

TypeOK ==
  /\ mode \in {"off", "guiding", "closed"}
  /\ attempt \in 0..MaxAttempts
  /\ reached \subseteq 1..Steps
  /\ skipped \subseteq 1..Steps

Init == mode = "off" /\ attempt = 0 /\ reached = {} /\ skipped = {}

Remaining == {step \in 1..Steps : step \notin reached /\ step \notin skipped}
Done == Remaining = {}
\* 表示中のステップ（残っているうちの最初）
CurrentStep == CHOOSE step \in Remaining : \A other \in Remaining : step <= other

\* 別の演習が始まる（sync）。そのパックにガイドがあれば最初から案内し、なければ閉じる
NewAttempt ==
  /\ attempt < MaxAttempts
  /\ attempt' = attempt + 1
  /\ reached' = {} /\ skipped' = {}
  /\ \E guided \in BOOLEAN : mode' = IF guided THEN "guiding" ELSE "off"

\* 出来事が起きる（sync・reach）。案内していないときは受け付けない
Reach ==
  /\ mode = "guiding"
  /\ \E step \in 1..Steps : reached' = reached \cup {step}
  /\ UNCHANGED <<mode, attempt, skipped>>

\* 表示中のステップを飛ばす
Skip ==
  /\ mode = "guiding" /\ ~Done
  /\ skipped' = skipped \cup {CurrentStep}
  /\ UNCHANGED <<mode, attempt, reached>>

\* ガイドを閉じる（✕、または終わったあとの「課題一覧へ」）
Close ==
  /\ mode = "guiding"
  /\ mode' = "closed"
  /\ UNCHANGED <<attempt, reached, skipped>>

Next == NewAttempt \/ Reach \/ Skip \/ Close

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
\* 演習が始まるまでは off のまま
OffBeforeAttempt == (attempt = 0) => (mode = "off" /\ reached = {} /\ skipped = {})

\* 飛ばせるのは、まだ済んでいないステップだけ（表示中のステップは、済みでも飛ばしたものでもない）
CurrentIsRemaining == ~Done => (CurrentStep \notin reached /\ CurrentStep \notin skipped)

\* 案内していないときは、進み具合を変えない（閉じたガイドが裏で進まない）
FrozenUnlessGuiding ==
  [][(mode # "guiding" /\ attempt' = attempt) => (reached' = reached /\ skipped' = skipped /\ mode' = mode)]_vars

\* 同じ演習の中では、進み具合は戻らない
ProgressOnlyGrows ==
  [][(attempt' = attempt) => (reached \subseteq reached' /\ skipped \subseteq skipped')]_vars
=============================================================================
