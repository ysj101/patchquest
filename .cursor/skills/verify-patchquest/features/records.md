# Records

Records shows mastery by category and achievements. The lead explains badges and stars through ★3. It does not mention 復習クエスト, 週間目標, 別条件で挑戦, or the mission-page XP display. It does not offer progress export, import, or delete. Past challenge, review, and weekly-goal data still renders here.

## Sub-features

- `records-open` shows the heading `記録`.
- `records-mastery` shows the region `習熟度`.
- `records-achievements` shows the region `実績`.
- `records-no-progress-tools` has no `progress-export` anchor and no `進捗を書き出す` button.

## How to get to it (user POV)

- Choose `記録` in the header navigation.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- Start from the mission list.

- **Open records.** Step `click` with role `button`, name `記録`, and `exact: true`. Heading `記録` is visible.
- **See mastery and achievements.** Step `expectVisible` for region `習熟度` and region `実績`.
- **Confirm tools are absent.** Step `expectCount` with text `進捗を書き出す` and count `0`.
- **Confirm removed features are not advertised.** Step `expectCount` with count `0` for each of `復習クエスト`, `週間目標`, `別条件で挑戦`, and `XP は取り組み`.
- **Proof.** Step `screenshot` with file `records.png`. The shot shows mastery and achievements. It does not invite the learner to use a removed feature.

## Gotchas

- There is no `設定` button on this page. Open settings from the mission list or from the storage warning's `設定を開く` button when that banner is shown.
- The name `記録` matches mastery and achievements. A progress tools section on this page means the map is stale.
