# Settings

Settings is the dialog opened from the `設定` button. It holds motion and sound controls, and the progress actions `進捗を書き出す`, `進捗を読み込む`, and `進捗をすべて削除`.

## Sub-features

- `settings-open` opens the dialog from the mission list.
- `settings-export` downloads a progress JSON file.
- `settings-delete` asks for confirmation before clearing progress.
- `settings-import` restores progress from a JSON file.

## How to get to it (user POV)

- Choose `設定` on the mission list hero.
- Choose `設定` on the exercise ticket.
- When the browser cannot store progress, choose `設定を開く` on the warning banner.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- The context has no saved progress.
- `evidenceDir` is `/tmp/patchquest-verify-evidence`.

- **Open settings.** Choose `設定`. Step `click` with role `button`, name `設定`, and `exact: true`. A dialog named `設定` shows `進捗を書き出す`.
- **Export.** Choose `進捗を書き出す`. Step `download` with role `button`, name `進捗を書き出す`, and `saveAs` `progress.json`. The file name matches `patchquest-progress-YYYY-MM-DD.json`.
- **Confirm delete.** Choose `進捗をすべて削除`. A dialog named `進捗をすべて削除しますか？` appears. Press `Escape` to cancel. Step `press` with key `Escape`. The mission row for `test-pack` still offers `続きから始める` when that mission was in progress.
- **Proof.** Step `screenshot` with file `settings.png` while the dialog is open. The shot shows `進捗を書き出す` and the sentence `進捗はこのブラウザの中だけに保存されます`.

## Gotchas

- The file input is visually hidden. Use `upload`, not a click on `進捗を読み込む`, to choose a file. To import the file this recipe just exported, set `file.savedAs` to that download's `saveAs`.
- `進捗をすべて削除` does nothing until the confirm dialog's `削除する` is chosen. `Escape` cancels.
- The storage sentence appears in this dialog only. A second copy on the mission list or the records page means the map is stale.
- Effect controls stay in the same dialog. Do not treat a missing `演出の設定` heading as a failure. The dialog name is `設定`.
