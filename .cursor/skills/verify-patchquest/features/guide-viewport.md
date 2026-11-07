# Guide viewports

The practice guide remains readable through all six items at 1280×800, 1024×600, and 390×844, including after scrolling to the highlighted target.

## Sub-features

- `guide-readable` keeps the heading, body, praise, and retry inside the viewport and guide band, clear of the site header and other elements.
- `guide-target` brings the marked target into view through `場所を表示` and retains its pulse when motion is on.

## How to get to it (user POV)

1. Choose `まずは練習（3 分）` from the mission list.
2. Read `準備ができたら始めよう`, then choose `演習を始める`.
3. Read `何が起きたか読んでみよう`, then choose `ミッション開始`.
4. Read `こわしてみよう`, open `調査`, and choose `送る` with the supplied long title.
5. Read `なおし方を選ぼう`, open `対策`, select `保存するときに文字数を確かめる`, and choose `この対策を適用する`.
6. Read `たしかめよう`, then choose `攻撃と普段の使い方を検証する`.
7. Read `ふりかえろう`, open `振り返り`, select `コメントを保存するときに文字数を確かめる`, and choose `回答する`.

## Driving it with drive.ts

- Set recipe `viewport` to each of the three sizes above, using a fresh context for each run.
- At each heading, add `expectGuide` with `title` equal to that heading.
- Click `場所を表示` within `.guide`, then repeat `expectGuide` with `target: true`. This opens the requested tab and scrolls to its marked content.
- Add `screenshot` after each check, with `fullPage: false`. Save one shot per item per viewport, named `after-1280x800-step3.png`, for example.
- Follow the actions above with `click` steps. A radio can be selected with `click` and role `radio`.

## Gotchas

- Evidence names `step1` through `step6` mean manifest order. The existing display counter restarts on entering the workbench and reads `1 / 6`, `2 / 6`, `1 / 6`, `2 / 6`, `3 / 6`, `4 / 6`.
- Do not skip items or set progress through internals. Each requested learner action advances the guide.
- An immediate screenshot can catch the entry animation at zero opacity. `expectGuide` waits for finite guide animations to finish before measuring or capturing evidence.
