---------------------------- MODULE SerialLatest ----------------------------
(***************************************************************************)
(* 直列化して最後の要求だけを実行する仕組み（platform/ui/serial.ts の      *)
(* serialLatest）のモデル。演習画面の描き直しに使う。                      *)
(*                                                                         *)
(* 要求は 1 件ずつ順に実行する。待っている間にあとから要求が来たら、古い   *)
(* 要求は実行せずに飛ばす。同じ鍵の要求が実行中で、間に待っている要求が    *)
(* なければ、新たに実行せず、実行中の結果に合流する。鍵のない要求（Fresh） *)
(* は合流しない。                                                          *)
(*                                                                         *)
(* 検査すること：実行は重ならない。落ち着いたとき、最後に終えた実行は、    *)
(* 最後の要求（またはそれが合流した実行）である。                          *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS
  MaxCalls,  \* 要求の回数の上限
  Keys       \* 合流に使う鍵（表示する利用者など）

Fresh == "fresh"
ASSUME Fresh \notin Keys

VARIABLES
  calls,     \* これまでの要求の回数
  request,   \* 実行の候補にした要求の通し番号（serial.ts の request）
  waiting,   \* 順番を待っている要求の数（serial.ts の waiting）
  chain,     \* 順番を待っている要求（古い順）
  running,   \* 実行中の要求。None は実行していない
  expect,    \* 最後の要求が結果として受け取る実行の番号（自分の番号か、合流した実行の番号）
  lastDone   \* 最後に終えた実行の番号。0 はまだない

vars == <<calls, request, waiting, chain, running, expect, lastDone>>

None == [id |-> 0, key |-> "none"]
Entries == [id : 1..MaxCalls, key : Keys \cup {Fresh}]

TypeOK ==
  /\ calls \in 0..MaxCalls
  /\ request \in 0..MaxCalls
  /\ waiting \in 0..MaxCalls
  /\ chain \in Seq(Entries)
  /\ running \in Entries \cup {None}
  /\ expect \in 0..MaxCalls
  /\ lastDone \in 0..MaxCalls

Init ==
  /\ calls = 0 /\ request = 0 /\ waiting = 0 /\ chain = <<>>
  /\ running = None /\ expect = 0 /\ lastDone = 0

\* 実行中の要求と同じ鍵で、間に別の要求が待っていなければ合流できる
CanJoin(key) == running # None /\ key # Fresh /\ running.key = key /\ waiting = 0

Call(key) ==
  /\ calls < MaxCalls
  /\ calls' = calls + 1
  /\ IF CanJoin(key)
       THEN /\ expect' = running.id
            /\ UNCHANGED <<request, waiting, chain>>
       ELSE /\ request' = request + 1
            /\ waiting' = waiting + 1
            /\ chain' = Append(chain, [id |-> request + 1, key |-> key])
            /\ expect' = request + 1
  /\ UNCHANGED <<running, lastDone>>

\* 前の実行が終わり、次の要求の番が来る。あとから要求が来ていたら実行せずに飛ばす
Dequeue ==
  /\ running = None /\ chain # <<>>
  /\ waiting' = waiting - 1
  /\ chain' = Tail(chain)
  /\ running' = IF Head(chain).id = request THEN Head(chain) ELSE None
  /\ UNCHANGED <<calls, request, expect, lastDone>>

\* 実行が終わる
Finish ==
  /\ running # None
  /\ lastDone' = running.id
  /\ running' = None
  /\ UNCHANGED <<calls, request, waiting, chain, expect>>

Next == (\E key \in Keys \cup {Fresh} : Call(key)) \/ Dequeue \/ Finish

Spec == Init /\ [][Next]_vars /\ WF_vars(Dequeue) /\ WF_vars(Finish)

-----------------------------------------------------------------------------
Idle == running = None /\ chain = <<>>

\* waiting は、順番を待っている要求の数と一致する
WaitingMatchesChain == waiting = Len(chain)

\* 最後の要求が受け取るのは、いちばん新しい実行の候補（飛ばされない要求）
ExpectIsLatest == expect = request

\* 合流できるのは、実行中の要求がいちばん新しい候補のときだけ
JoinOnlyLatest == \A key \in Keys : CanJoin(key) => running.id = request

\* 落ち着いたとき、最後に終えた実行は、最後の要求が受け取る実行である（最新の要求だけが反映される）
LatestWins == Idle => lastDone = expect

\* 実行は番号の順に進む（古い要求が、新しい要求のあとで実行されることはない）
InOrder == [][lastDone' >= lastDone]_vars

\* 要求が止まれば、いつか落ち着く
Settles == []<>Idle
=============================================================================
