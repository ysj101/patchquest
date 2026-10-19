# Start an exercise

Starting `test-pack` runs the preflight, enters the workbench, and returns to the mission list with the same ticket so the row says `続きから始める`.

## Sub-features

- `exercise-start` passes preflight and shows the workbench.
- `exercise-return` returns to the mission list with `途中` and `続きから始める`.

## How to get to it (user POV)

- On the mission list, choose `この課題を始める` on the `test-pack` row.
- Choose `演習を始める` after preflight.
- Choose `課題一覧へ戻る` to leave.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- `test-pack` is on the list. That requires the `--test` build. A production catalog build has no `test-pack`, and this journey fails for that reason.

- **Start.** Step `click` with role `button`, name `この課題を始める`, and `within` `[data-mission="test-pack"]`.
- **Begin.** Step `click` with role `button`, name `演習を始める`. If `ミッション開始` is visible, click it.
- **Return.** Step `click` with role `button` and name matching `課題一覧へ戻る`. The `test-pack` row shows `続きから始める`.
- **Proof.** Step `screenshot` with file `exercise-returned.png` on the mission list. The row shows `途中`.

## Gotchas

- Preflight can take longer than a normal click. Wait for `演習を始める` rather than clicking on a timer.
- `課題一覧へ戻る` also matches the brand button if the name is not anchored. Use the button whose name is `課題一覧へ戻る` or `← 課題一覧へ戻る`, not the brand.
- Do not use `/test/progress.html` or `window.progressTest` for this journey. That page is a harness, not the learner UI.
