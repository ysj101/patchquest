# PatchQuest verification map

This directory is the maintained source for verifying the PatchQuest learning UI. Read this index, then use the matching feature file.

## Baseline preconditions

- Build with `pnpm exec node scripts/build.mjs --test` so `test-pack` is on the mission list.
- Serve `dist` with `python3 -m http.server` on `127.0.0.1` and a port this run owns. The examples use `4173`.
- Record the server pid in `/tmp/patchquest-verify.pid`.
- Run `node --experimental-strip-types .cursor/skills/verify-patchquest/drive.ts doctor http://127.0.0.1:4173` and require `ready`.
- Each `drive.ts run` opens a new Chrome context. Progress does not leak between runs.
- Do not drive a server this run did not start.

## Driving conventions

- Start every recipe from the mission list unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names. Use `within` only to pick one of several identical buttons.
- Run browser actions through `node --experimental-strip-types .cursor/skills/verify-patchquest/drive.ts run <recipe.json>`.
- Write proof under `/tmp/patchquest-verify-evidence`. Cleanup must not delete that directory.

## Proof and skip reporting

- Capture the action and the resulting state.
- UI proof is a screenshot that shows the control and the result.
- A download proof includes the file written by the `download` step.
- Record the feature id with the artifact name.
- If a path is unreachable, report the step and the unmet precondition. Do not claim another path as a substitute.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with drive.ts`
4. `Gotchas`

## Features

- [Mission list](./mission-list.md) covers the PatchQuest intro, the next step, the mission table (unread rows show only `未着手`; started rows keep `達成印`), the settings button, and the absence of the engagement block and progress tools.
- [Settings](./settings.md) covers effect controls and progress export, import, and delete.
- [Records](./records.md) covers mastery and achievements, Japan-time unlock dates, the absence of progress tools, and the absence of copy that points at 復習クエスト, 週間目標, 別条件で挑戦, or the mission-page XP display.
- [Start an exercise](./start-exercise.md) covers starting `test-pack` and returning to the list with the same ticket.
- [Situation screen](./situation.md) covers one request sentence, the `今やること` line, and the practice guide bar that does not cover the work.
- [Investigation](./investigation.md) covers the investigate tab, where the raw request editor starts closed.
- [Debrief](./debrief.md) covers the lesson at the top of 振り返り, the absence of 安全化状況 there, the understanding check, and retry.
