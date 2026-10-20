# Verify results

After 攻撃と普段の使い方を検証する, the 対策 tab shows a few conclusion lines. Each line is one question: 攻撃を防げたか, 正常な利用ができるか, and ほかの守りが壊れていないか when that group has tests. A failed attack line says 攻撃が通ってしまう. The lines do not show a percent. 詳しく見る opens the per-test 期待 and 実測 cards. The cards start closed.

## Sub-features

- `verify-conclusions` shows pass or fail on one line per group, with no percent.
- `verify-details` keeps 期待 and 実測 behind 詳しく見る.
- `verify-vulnerable` says 攻撃が通ってしまう when the learner verifies before a fix.
- `verify-wrong` shows which conclusion failed for a defense that does not pass.

## How to get to it (user POV)

- On the mission list, choose `この課題を始める` on the mission row.
- Choose `演習を始める`, then `ミッション開始`.
- Open `対策`, choose a defense, choose `この対策を適用する`, then `攻撃と普段の使い方を検証する`.
- To verify the unfixed app, choose `対策を取り消す`, then verify again.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- The test catalog build is running.

- **Read the conclusion.** After a passing defense, step `expectVisible` for button `詳しく見る` with `exact: true`. Step `expectCount` for `攻撃が通ってしまう` with count `0` and `within` `[data-anchor="results"]`. Step `expectCount` for `%` with count `0` and `within` `.verify-conclusions`.
- **Open the cards.** Step `click` with role `button`, name `詳しく見る`, and `exact: true`. 期待 is visible inside `[data-anchor="results"]`.
- **Verify before a fix.** Apply a defense, click `対策を取り消す`, then verify. The results contain `攻撃が通ってしまう` and the conclusions do not contain `%`.
- **Choose a wrong defense.** On `非公開メモを守る`, apply `画面のリンクだけを隠す` and verify. The attack line says `攻撃が通ってしまう`. Apply `ID 指定でのメモの取得をすべて断る` and verify. The normal-use line says `不合格`.
- **Proof.** Step `screenshot` with file `verify-secured.png` before opening `詳しく見る`. The shot shows the conclusion lines and not the 期待 cards.

## Gotchas

- `詳しく見る` is a button. Click it once. A second click closes the cards.
- A bare summary is not a button in this Chrome. The control is the button named `詳しく見る`.
- The verdict banner `防御できました` or `まだ合格ではありません` stays above the lines. The rechoose button `① に戻って対策を選び直す` stays with a failed verdict.
- `安全化状況` and a percent such as `82%` are not on this screen. The 振り返り history still keeps its own counts.
