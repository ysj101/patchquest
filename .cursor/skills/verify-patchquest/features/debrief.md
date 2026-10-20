# Debrief

The 振り返り tab is the lesson after a defense passes. The first view shows 原因 and 持ち帰ること. この対策が効く理由 is the next section. 理解の確認 and 新しいデータで再挑戦する stay below the lesson.

## Sub-features

- `debrief-lesson` shows 原因 and 持ち帰ること without scrolling, and does not show 安全化状況 inside the debrief.
- `debrief-check` answers 理解の確認.
- `debrief-retry` starts a new attempt from 新しいデータで再挑戦する.

## How to get to it (user POV)

- On the mission list, choose `この課題を始める` on the `test-pack` row.
- Choose `演習を始める`, then `ミッション開始`.
- Open `対策`, choose `所有者を照合する`, choose `この対策を適用する`, then `攻撃と普段の使い方を検証する`.
- Open `振り返り`.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- `test-pack` is on the list. That requires the `--test` build.

- **Open the lesson.** Step `click` tab `振り返り` after the defense above. Step `expectVisible` for heading `原因` and heading `持ち帰ること`. Step `expectCount` for `安全化状況` with count `0` and `within` `.debrief`.
- **Answer the check.** Step `click` radio `取得時に所有者を照合する` with `exact: true`, then button `回答する`. Step `expectCount` for `正解` with count `1` and `within` `.debrief`.
- **Retry.** Step `click` button `新しいデータで再挑戦する`. Button `演習を始める` is visible.
- **Proof.** Step `screenshot` with file `debrief.png` after the tab opens and before scrolling. The shot shows 原因 and 持ち帰ること. It does not show the 安全化状況 panel in the debrief.

## Gotchas

- At 1280×720 the tools column starts near the bottom of the first screen. 原因 and 持ち帰ること share that first row. この対策が効く理由 is the next row, just below that screen.
- `安全化状況` is not on the 対策 tab. That tab shows the verify conclusions. A count of zero applies inside `.debrief`.
- The second attempt skips `ミッション開始` because this mission was already briefed.
