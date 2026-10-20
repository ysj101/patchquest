# Mission list

The mission list is the home screen. The heading is `PatchQuest`. One line says this is a practice on an app that has a security hole, and that you experience it and fix it. It does not say `わざと壊した`. Three short steps follow (体験する, 直す, テストで確かめる), then a line that the app stays in the browser. The next step and the mission table stay below that. It does not show the engagement block (復習クエスト, 週間目標, XP) or a 「別条件で挑戦する」 button. Progress export, import, and delete are not on this page. The browser tab title is `PatchQuest`. The header navigation button stays `課題`.

## Sub-features

- `list-render` shows the heading `PatchQuest`, the list `練習の流れ`, and the table `課題の一覧`.
- `list-no-progress-tools` has no region named `進捗`.
- `list-settings` reaches the settings dialog from `設定`.
- `list-unstarted-badges` shows `未着手` on a mission that has not started, and does not show the list `達成印` on that row.
- `list-started-badges` keeps the list `達成印` on a mission whose row says `途中` or `完了`.

## How to get to it (user POV)

- Open the site root.
- Choose `課題` in the header navigation.
- Choose the PatchQuest mark, whose accessible name is `PatchQuest（課題一覧へ戻る）`, from another page.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.

- **See the list.** Step `goto` with path `/`, then `expectVisible` for heading `PatchQuest` with `exact: true`. Step `expectTitle` with text `PatchQuest`. Step `expectCount` for `セキュリティホールのあるアプリ` with count `1`. Step `expectCount` for `わざと壊した` with count `0` and `within` `.hero`. The practice mission summary still uses that phrase. It is not the intro. Step `expectText` for list `練習の流れ` and childRole `listitem` with text `["体験する", "直す", "テストで確かめる"]`.
- **Check the tools are gone.** Step `expectCount` with text `進捗を書き出す` and count `0`. Step `expectText` for navigation `ページ` buttons with text `["課題", "記録"]`.
- **Open settings.** Step `scroll` then `click` on button `設定` with `exact: true`. The dialog `設定` is visible.
- **Proof.** Step `screenshot` with file `mission-list.png` before opening settings. The shot shows the name, the three steps, `まずは練習（3 分）`, and the table. It does not show a level-1 heading `課題`.
- **Unread stamps stay off the table.** On a fresh list, step `expectCount` with text `再現：未達成`, count `0`, and `within` `.mission-table`. Each row still shows `未着手`.
- **Started rows keep stamps.** Follow the start-exercise journey for `test-pack` and return to the list. Step `expectCount` with text `途中` and count `1` within `[data-mission="test-pack"]`. Step `expectCount` with text `再現：未達成` and count `1` within `[data-mission="test-pack"]`. A row that still says `未着手` has no list named `達成印`.
- **Narrow width.** A second recipe sets `viewport` to width `390` and height `844`, then screenshots `mission-list-phone.png`. The intro stays readable. The practice button and `設定` stay on screen.

## Gotchas

- The table column labelled `進捗` is each mission's status. It is not the export section. A shot of that column does not prove the tools are still on the list.
- `未着手` is the status pill. It is not one of the three stamps. A fresh row has that pill and no list named `達成印`. A `途中` or `完了` row still has that list. The exercise ticket keeps its own `達成印` even when every stamp says `未`.
- The header button `課題` is navigation. It is not the page heading. Doctor and `list-render` wait for heading `PatchQuest`.
- After returning from an exercise, scroll the `設定` button into view before clicking. Focus on the heading can leave the button outside the clickable area.
