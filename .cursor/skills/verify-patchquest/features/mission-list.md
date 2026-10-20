# Mission list

The mission list is the home screen. It shows the next step and the mission table. It does not show the engagement block (復習クエスト, 週間目標, XP) or a 「別条件で挑戦する」 button. Progress export, import, and delete are not on this page.

## Sub-features

- `list-render` shows the heading `課題` and the table.
- `list-no-progress-tools` has no region named `進捗`.
- `list-settings` reaches the settings dialog from `設定`.

## How to get to it (user POV)

- Open the site root.
- Choose `課題` in the header navigation.
- Choose the PatchQuest mark, whose accessible name is `PatchQuest（課題一覧へ戻る）`, from another page.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.

- **See the list.** Step `goto` with path `/`, then `expectVisible` for heading `課題`.
- **Check the tools are gone.** Step `expectCount` with text `進捗を書き出す` and count `0`. Step `expectText` for navigation `ページ` buttons with text `["課題", "記録"]`.
- **Open settings.** Step `scroll` then `click` on button `設定` with `exact: true`. The dialog `設定` is visible.
- **Proof.** Step `screenshot` with file `mission-list.png` before opening settings. The shot shows the next step and the table. It does not show `取り組み`, `復習クエスト`, `週間目標`, or `別条件で挑戦する`.

## Gotchas

- The table column labelled `進捗` is each mission's status. It is not the export section. A shot of that column does not prove the tools are still on the list.
- After returning from an exercise, scroll the `設定` button into view before clicking. Focus on the heading can leave the button outside the clickable area.
