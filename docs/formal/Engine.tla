------------------------------- MODULE Engine -------------------------------
(***************************************************************************)
(* 教材ロジックの実行エンジン（runtimes/browser/engine.ts）の、準備と      *)
(* 演習用の機械（本物の Linux）のモデル。                                  *)
(*                                                                         *)
(* 準備（prepare）は、いまの準備の中身を取り上げ（準備されていない状態に   *)
(* なる）、動いている機械があれば使い回し、なければ起動して、新しい中身を  *)
(* 置く。準備は await で区切られるので、順番に行わないと重なる。           *)
(*                                                                         *)
(* Serialized が TRUE なら 1 件ずつ順に行う（いまの実装）。FALSE にすると  *)
(* 書き換える前の実装になり、機械を 2 台起動して 1 台を止め忘れる          *)
(* （AtMostOneMachine と NoLeakedMachine が破れる）。                      *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxRequests,  \* 準備を頼む回数の上限
  Serialized    \* 準備を 1 件ずつ順に行うか

VARIABLES
  requested,  \* これまでに頼んだ準備の数（番号は頼んだ順）
  waiting,    \* まだ始めていない準備の番号
  building,   \* 進めている準備。[id, reuse]。reuse は、動いている機械を受け取ったか
  prepared,   \* いまの準備の中身を置いた準備の番号。0 は準備されていない
  owned,      \* いまの準備の中身が、機械を指しているか
  machines    \* 動いている機械の数

vars == <<requested, waiting, building, prepared, owned, machines>>

TypeOK ==
  /\ requested \in 0..MaxRequests
  /\ waiting \subseteq 1..MaxRequests
  /\ building \subseteq [id : 1..MaxRequests, reuse : BOOLEAN]
  /\ prepared \in 0..MaxRequests
  /\ owned \in BOOLEAN
  /\ machines \in 0..MaxRequests

Init ==
  /\ requested = 0 /\ waiting = {} /\ building = {}
  /\ prepared = 0 /\ owned = FALSE /\ machines = 0

Request ==
  /\ requested < MaxRequests
  /\ requested' = requested + 1
  /\ waiting' = waiting \cup {requested + 1}
  /\ UNCHANGED <<building, prepared, owned, machines>>

\* 順番に行うなら、前の準備が終わってから、頼まれた順に始める。順番に行わないなら、いつでも始まる
MayBegin(id) ==
  Serialized => (building = {} /\ \A other \in waiting : id <= other)

\* 準備を始める。いまの準備の中身（機械を含む）を取り上げる
Begin ==
  \E id \in waiting :
    /\ MayBegin(id)
    /\ waiting' = waiting \ {id}
    /\ building' = building \cup {[id |-> id, reuse |-> owned]}
    /\ prepared' = 0 /\ owned' = FALSE
    /\ UNCHANGED <<requested, machines>>

\* 準備が終わる。機械を受け取っていなければ起動し、新しい中身を置く（前の中身があっても上書きする）
Finish ==
  \E build \in building :
    /\ building' = building \ {build}
    /\ machines' = IF build.reuse THEN machines ELSE machines + 1
    /\ prepared' = build.id /\ owned' = TRUE
    /\ UNCHANGED <<requested, waiting>>

\* 準備に失敗する。受け取った機械は止め、準備されていない状態のままにする
Fail ==
  \E build \in building :
    /\ building' = building \ {build}
    /\ machines' = IF build.reuse THEN machines - 1 ELSE machines
    /\ UNCHANGED <<requested, waiting, prepared, owned>>

Next == Request \/ Begin \/ Finish \/ Fail

Spec == Init /\ [][Next]_vars /\ WF_vars(Begin) /\ WF_vars(Finish \/ Fail)

-----------------------------------------------------------------------------
\* 進めている準備が受け取った機械の数
Held == Cardinality({build \in building : build.reuse})

\* 機械は 1 台まで
AtMostOneMachine == machines <= 1

\* 動いている機械は、いまの準備の中身か、進めている準備のどれかが持っている（止め忘れた機械がない）
NoLeakedMachine == machines = (IF owned THEN 1 ELSE 0) + Held

\* 準備の中身が置かれているのは、進めている準備がないときだけ（順番に行う場合）
PreparedMeansIdle == (Serialized /\ prepared # 0) => (building = {})

\* 落ち着いたとき、準備されているなら、それは最後に頼んだ準備である（先に頼んだ準備が、あとの準備を上書きしない）
LatestWins == (waiting = {} /\ building = {} /\ prepared # 0) => prepared = requested

\* 頼んだ準備は、いつかすべて終わる
Settles == <>[](waiting = {} /\ building = {})
=============================================================================
