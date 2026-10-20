# Reference code

The repair tab has a disclosure named `参考コードを見る`. Opening it shows two panes, `変更前（いまの状態）` and `変更後`, for the selected defense. Keywords, strings, and comments are colored. The before pane stays on the red ground and the after pane stays on the green ground. The disclosure adds no legend.

## Sub-features

- `reference-open` opens `参考コードを見る` and shows the heading `参考コード（閲覧専用）`.
- `reference-colors` shows keyword, string, and comment spans inside the panes.
- `reference-missions` does this for `onboarding`, `idor`, `sqli`, `stored-xss`, and `test-pack`.

## How to get to it (user POV)

- On the mission list, choose `この課題を始める` on a mission row.
- Choose `演習を始める`, then `ミッション開始`.
- Choose the `対策` tab.
- Choose a defense, then `参考コードを見る`.

## Driving it with drive.ts

Preconditions:

- Doctor reports `ready` at `http://127.0.0.1:4173`.
- The test catalog build is required for `test-pack`. The four shipped missions are in every build.

- **Open one mission.** Step `click` button `この課題を始める` with `exact: true` and `within` `[data-mission="sqli"]`. Step `click` button `演習を始める`. Step `click` button `ミッション開始` with `exact: true`. Step `click` tab `対策`.
- **Choose a defense.** Step `click` radio whose `namePattern` is the defense label, for example `検索語を値としてバインド`.
- **Open the code.** Step `click` button `参考コードを見る` with `exact: true`. The summary has `role="button"`. Step `expectVisible` heading whose `namePattern` is `参考コード（閲覧専用）`.
- **Proof.** Step `scroll` that heading, then `screenshot`. The shot shows both panes. Keyword text is blue, string text is gold, and comment text is muted. The pane grounds stay red and green.
- **Other missions.** Repeat from the list for `onboarding`, `idor`, `stored-xss`, and `test-pack`. Use a defense whose code contains a string or a comment when the mission has one (`保存するときに文字数を確かめる`, `script タグだけを削除する`, `表示だけ変える`).

## Gotchas

- `参考コードを見る` is a button only after the summary sets `role="button"`. A plain `<summary>` is a disclosure triangle, and `drive.ts` does not find it as a button.
- The radio's accessible name includes the description after the label. Use `namePattern` with the label, not `exact`.
- Do not treat the verify-result mono text as this code view. That text is the expected and actual columns, and it stays uncolored.
