# Situation screen

The situation screen is the exercise workbench with the `状況` tab open. The request sentence appears once, in the left `依頼`. The tab does not repeat it as `問い合わせ` or `目標`. A one-line `今やること` sits under the ticket and changes with the stage. The practice guide is a one-line bar fixed just under the site header. It highlights its target and does not dim or cover the header, the log, the app, or the action buttons. Only the guide's own buttons receive clicks.

## Sub-features

- `situation-request-once` shows the incident in `.desk-request` and not again in the `状況` tab.
- `situation-now` shows `今やること：` and changes the sentence when the stage changes.
- `situation-guide-clear` keeps the `操作ガイド` off the log, the preview, and `送る`. The guide spot is hidden. The lit target matches the open tab.

## How to get to it (user POV)

- Choose `まずは練習（3 分）`, then `演習を始める`, then `ミッション開始`.
- The `状況` tab is selected.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- The catalog includes the practice mission. The test build does.

- **Open the practice.** Step `click` on button `まずは練習（3 分）`, then `演習を始める`, then `ミッション開始` with `exact: true`.
- **See one request.** Step `expectVisible` for heading `依頼`. Step `expectCount` with text `問い合わせ` and count `0`. Step `expectCount` with text `今やること：調査を開いて` and count `1`.
- **Match the guide to the tab.** The guide heading is `こわしてみよう` and the lit target is the `調査` tab. Open `調査` and the lit target becomes the request actions.
- **Proof.** Step `screenshot` with file `situation.png` and `fullPage: true`. The shot shows one request, the `今やること` line, and the guide bar along the top.

## Gotchas

- `問い合わせ` is absent. Do not treat the left `依頼` as a second copy of the tab.
- The guide list items are visually small. Their accessible names still include the step title.
- Reopening the practice continues the current step in the top bar. It does not cover the screen with a dimmer.
- `判定の根拠` is not on this screen.
