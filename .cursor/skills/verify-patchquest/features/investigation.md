# Investigation

The investigate tab shows preset actions. The raw request editor starts closed under `上級者向け`. Opening it shows the method, path, body, and `このリクエストを送る`. `編集欄にコピー` fills that editor and opens it.

## Sub-features

- `investigate-collapsed` hides the raw editor until `上級者向け` is opened.
- `investigate-action` sends a preset action with `送る`.
- `investigate-editor` edits and sends a request after the editor is open.
- `investigate-copy` copies a preset action into the editor and opens it.

## How to get to it (user POV)

- Start `まずは練習（3 分）`, choose `演習を始める`, then `ミッション開始`.
- Choose the `調査` tab.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- The test catalog build is running, so `まずは練習（3 分）` is on the mission list.

- **Open the tab.** Step `click` with role `tab`, name `調査`. The button `送る` is visible. The button `このリクエストを送る` is not visible. `上級者向け` is visible.
- **Send the preset.** Step `click` with role `button`, name `送る`, and `exact: true`. The heading `脆弱性を再現しました` becomes visible.
- **Open the editor.** Step `click` with role `button`, name `上級者向け`, and `exact: true`. The button `このリクエストを送る` is visible.
- **Copy into the editor.** On a fresh load, step `click` with role `button`, name `編集欄にコピー`. The path field shows the preset path, and `このリクエストを送る` is visible.
- **Proof.** Step `screenshot` with file `investigate.png` before opening `上級者向け`. The shot shows the preset action and not the method, path, or body fields.

## Gotchas

- `上級者向け` is a button. Click it once. A second click closes the editor.
- `編集欄にコピー` opens that same element. Do not click `上級者向け` again after copying, or the editor closes.
- The back button on the exercise ticket includes a CSS arrow in its accessible name. Use a name pattern `^(?:← )?課題一覧へ戻る$` when leaving.
- `このリクエストを送る` is hidden until the editor is open. A click before that times out.
