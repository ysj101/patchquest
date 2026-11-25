------------------------------ MODULE Popover ------------------------------
(***************************************************************************)
(* 小さな説明（ポップオーバー）の開閉（platform/ui/popover-model.ts）の    *)
(* モデル。遷移表は POPOVER_MACHINE と同じ。                               *)
(* tests/unit/formal-models.test.ts が、この Transitions と表の一致を      *)
(* 確かめる。                                                              *)
(*                                                                         *)
(* マウスの本当の位置（over）を別に持ち、状態がそれと食い違わないことを    *)
(* 検査する。書き換える前の実装は、マウスが外にあるときにキーで閉じると    *)
(* 「閉じた直後」の印が残り、次にマウスを乗せても開かなかった。            *)
(***************************************************************************)
States == {"closed", "peek", "pinned", "pinned-over", "dismissed"}
Events == {"press", "escape", "enter", "leave"}

\* 状態 × 操作 → 次の状態（POPOVER_MACHINE）。ここにない組み合わせでは状態を変えない
Transitions ==
  { <<"closed", "press", "pinned">>,
    <<"closed", "enter", "peek">>,
    <<"peek", "press", "pinned-over">>,
    <<"peek", "escape", "dismissed">>,
    <<"peek", "leave", "closed">>,
    <<"pinned", "press", "closed">>,
    <<"pinned", "escape", "closed">>,
    <<"pinned", "enter", "pinned-over">>,
    <<"pinned-over", "press", "dismissed">>,
    <<"pinned-over", "escape", "dismissed">>,
    <<"pinned-over", "leave", "pinned">>,
    <<"dismissed", "press", "pinned-over">>,
    <<"dismissed", "leave", "closed">> }

Defined(s, e) == \E t \in Transitions : t[1] = s /\ t[2] = e
Step(s, e) == IF Defined(s, e) THEN (CHOOSE t \in Transitions : t[1] = s /\ t[2] = e)[3] ELSE s

Open(s) == s \in {"peek", "pinned", "pinned-over"}

VARIABLES
  state,  \* ポップオーバーの状態
  over    \* マウスが本当に乗っているか

vars == <<state, over>>

Init == state = "closed" /\ over = FALSE

\* ボタンを押す（クリック・Enter・Space）。マウスの位置は変わらない
Press == state' = Step(state, "press") /\ UNCHANGED over

\* Esc は、開いているときだけ届く（閉じているときは何もしない）
Escape == Open(state) /\ state' = Step(state, "escape") /\ UNCHANGED over

\* マウスが乗る・離れる。ブラウザは、乗っていないときにだけ「乗った」を、乗っているときにだけ「離れた」を知らせる
Enter == ~over /\ over' = TRUE /\ state' = Step(state, "enter")
Leave == over /\ over' = FALSE /\ state' = Step(state, "leave")

Next == Press \/ Escape \/ Enter \/ Leave

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK == state \in States /\ over \in BOOLEAN

\* 状態が表すマウスの位置は、本当の位置と一致する
OverMatches == over <=> state \in {"peek", "pinned-over", "dismissed"}

\* 閉じていて開き直さない状態（dismissed）は、マウスが乗っている間だけ
DismissedOnlyWhileOver == (state = "dismissed") => over

\* 届く操作には、必ず遷移表の行がある（Esc は開いているときだけ届く）
EveryEventHandled ==
  /\ Defined(state, "press")
  /\ Open(state) => Defined(state, "escape")
  /\ ~over => Defined(state, "enter")
  /\ over => Defined(state, "leave")

\* 押すと開閉が入れ替わる（マウスを乗せただけで開いていたものは、開いたまま留める）
PressToggles == [][Press => (Open(state') <=> (~Open(state) \/ state = "peek"))]_vars

\* Esc のあとは閉じている
EscapeCloses == [][Escape => ~Open(state')]_vars

\* マウスを乗せると、閉じた直後でなければ開いている。離すと、押して開いたものだけが開いたまま残る
EnterOpens == [][Enter => Open(state')]_vars
LeaveKeepsOnlyPinned == [][Leave => (Open(state') <=> state = "pinned-over")]_vars
=============================================================================
