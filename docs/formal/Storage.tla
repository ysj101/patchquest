------------------------------ MODULE Storage ------------------------------
(***************************************************************************)
(* 進捗の保存先の切り替え（platform/progress/store.ts の withBackend と    *)
(* switchToMemory）のモデル。                                              *)
(*                                                                         *)
(* 保存先は persistent（ブラウザの保存領域）から switching（読めた記録を   *)
(* メモリへ引き継いでいる途中）を経て memory へ進み、戻らない。            *)
(* 書き込みは同時にいくつも走る。保存領域が書けなくなったとき、どの書き    *)
(* 込みも消えないことを検査する。                                          *)
(*                                                                         *)
(* 書き換える前の実装は、失敗した書き込みごとに別のメモリへ切り替えて      *)
(* いたので、先にやり直した書き込みが、あとの切り替えで消えた（Legacy を   *)
(* TRUE にすると、その動きになり、NoLostWrite が破れる）。                 *)
(***************************************************************************)
EXTENDS FiniteSets

CONSTANTS
  Writes,  \* 書き込みの集合（それぞれ 1 件の記録を書く）
  Legacy   \* TRUE なら、書き換える前の実装（書き込みごとに切り替える）を再現する

VARIABLES
  kind,       \* 保存先の状態
  disk,       \* 保存領域にある記録
  writable,   \* 保存領域に書けるか（一度書けなくなったら戻らない）
  memory,     \* メモリにある記録（memory になってから使う）
  carrying,   \* 引き継ぎで保存領域から読めた記録（switching の間だけ意味を持つ）
  readAll,    \* 引き継ぎで、保存領域の記録を読めたか
  own,        \* 書き換える前の実装で、書き込みごとに作るメモリへ入れる記録
  pc          \* 書き込みごとの進み具合

vars == <<kind, disk, writable, memory, carrying, readAll, own, pc>>

Kinds == {"persistent", "switching", "memory"}
\* idle: まだ頼んでいない / trying: 保存領域へ書こうとしている / waiting: 引き継ぎの完了を待っている / done: 書けた /
\* copying・failed は書き換える前の実装だけ（自分のメモリへ記録を写している・失敗を呼び出し元へ返した）
Steps == {"idle", "trying", "waiting", "done", "copying", "failed"}

TypeOK ==
  /\ kind \in Kinds
  /\ disk \subseteq Writes /\ memory \subseteq Writes /\ carrying \subseteq Writes
  /\ writable \in BOOLEAN /\ readAll \in BOOLEAN
  /\ own \in [Writes -> SUBSET Writes]
  /\ pc \in [Writes -> Steps]

Init ==
  /\ kind = "persistent" /\ disk = {} /\ writable = TRUE
  /\ memory = {} /\ carrying = {} /\ readAll = FALSE
  /\ own = [w \in Writes |-> {}]
  /\ pc = [w \in Writes |-> "idle"]

\* 保存領域が書けなくなる（別のタブが版を上げて接続が閉じた、など）
Break == writable /\ writable' = FALSE /\ UNCHANGED <<kind, disk, memory, carrying, readAll, own, pc>>

\* 書き込みを頼む。保存先の状態を読み、行き先を決める
Begin(w) ==
  /\ pc[w] = "idle"
  /\ \/ kind = "persistent" /\ pc' = [pc EXCEPT ![w] = "trying"] /\ UNCHANGED memory
     \/ kind = "switching" /\ pc' = [pc EXCEPT ![w] = "waiting"] /\ UNCHANGED memory
     \/ kind = "memory" /\ memory' = memory \cup {w} /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<kind, disk, writable, carrying, readAll, own>>

\* 保存領域へ書けた
TryOk(w) ==
  /\ pc[w] = "trying" /\ writable
  /\ disk' = disk \cup {w}
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<kind, writable, memory, carrying, readAll, own>>

(***************************************************************************)
(* 保存領域へ書けなかった。まだ切り替えが始まっていなければ始め（読めた    *)
(* 記録を控える。読めないこともある）、引き継ぎの完了を待つ。              *)
(***************************************************************************)
TryFail(w) ==
  /\ pc[w] = "trying" /\ ~writable
  /\ pc' = [pc EXCEPT ![w] = "waiting"]
  /\ IF kind = "persistent"
       THEN /\ kind' = "switching"
            /\ \E readable \in BOOLEAN :
                 /\ readAll' = readable
                 /\ carrying' = IF readable THEN disk ELSE {}
       ELSE UNCHANGED <<kind, carrying, readAll>>
  /\ UNCHANGED <<disk, writable, memory, own>>

\* 引き継ぎが終わり、メモリへ切り替わる
Carried ==
  /\ kind = "switching"
  /\ kind' = "memory"
  /\ memory' = carrying
  /\ UNCHANGED <<disk, writable, carrying, readAll, own, pc>>

\* 引き継ぎを待っていた書き込みを、メモリでやり直す
Retry(w) ==
  /\ pc[w] = "waiting" /\ kind = "memory"
  /\ memory' = memory \cup {w}
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<kind, disk, writable, carrying, readAll, own>>

(***************************************************************************)
(* 書き換える前の実装：保存領域へ書けなかった書き込みは、保存先がすでに    *)
(* メモリなら失敗を呼び出し元へ返す。そうでなければ自分でメモリを作り、    *)
(* 読めた記録を写してから（LegacyCopied）、保存先をそのメモリに置き換え    *)
(* て、自分の書き込みをやり直す。ほかの書き込みが先に置き換えたメモリの    *)
(* 中身は引き継がない。                                                    *)
(***************************************************************************)
LegacyFail(w) ==
  /\ pc[w] = "trying" /\ ~writable
  /\ IF kind = "memory"
       THEN pc' = [pc EXCEPT ![w] = "failed"] /\ UNCHANGED own
       ELSE /\ pc' = [pc EXCEPT ![w] = "copying"]
            /\ \E readable \in BOOLEAN : own' = [own EXCEPT ![w] = IF readable THEN disk ELSE {}]
  /\ UNCHANGED <<kind, disk, writable, memory, carrying, readAll>>

LegacyCopied(w) ==
  /\ pc[w] = "copying"
  /\ kind' = "memory"
  /\ memory' = own[w] \cup {w}
  /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ UNCHANGED <<disk, writable, carrying, readAll, own>>

WriteStep(w) ==
  \/ Begin(w) \/ TryOk(w) \/ Retry(w)
  \/ IF Legacy THEN LegacyFail(w) \/ LegacyCopied(w) ELSE TryFail(w)

Next == Break \/ Carried \/ \E w \in Writes : WriteStep(w)

Spec == Init /\ [][Next]_vars /\ WF_vars(Carried) /\ \A w \in Writes : WF_vars(WriteStep(w))

-----------------------------------------------------------------------------
\* メモリでやり直して書けた書き込み（保存領域には入っていない）
InMemoryOnly == {w \in Writes : pc[w] = "done" /\ w \notin disk}

\* メモリでやり直した書き込みは、消えない
NoLostWrite == InMemoryOnly \subseteq memory

\* いまの保存先から見える記録
Visible == IF kind = "memory" THEN memory ELSE disk

\* 引き継ぎで保存領域を読めたなら、書けた書き込みは、切り替えの前後を通じてすべて見える
EveryDoneWriteVisible ==
  (kind = "memory" => readAll) => \A w \in Writes : pc[w] = "done" => w \in Visible

\* メモリを使うのは、切り替えが終わってからだけ
MemoryOnlyAfterSwitch == (kind # "memory") => (memory = {})

\* 引き継ぎを待つ書き込みがあるのは、切り替えが始まってからだけ
WaitingOnlyAfterFailure == (\E w \in Writes : pc[w] = "waiting") => (kind # "persistent" /\ ~writable)

\* 保存先は persistent → switching → memory の向きにだけ進む
Rank(k) == IF k = "persistent" THEN 0 ELSE IF k = "switching" THEN 1 ELSE 2
OneWay == [][Rank(kind') >= Rank(kind)]_vars

\* 頼んだ書き込みは、いつか書ける
EveryWriteCompletes == \A w \in Writes : (pc[w] # "idle") ~> (pc[w] = "done")
=============================================================================
