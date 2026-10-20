---
name: verify-patchquest
description: Drive the PatchQuest learning UI in Chrome the way a learner does. Use to launch the local app, check it is the instance you started, and prove mission list, settings, records, or exercise behavior with screenshots.
---

# Verify PatchQuest

PatchQuest is a local learning UI in the browser. The learner touches the mission list, the settings dialog, the records page, and an exercise. This skill drives that UI with Playwright against a static server you start. Do not call page internals, `progressTest`, or store setters. Click, type, and choose files the way a learner would.

## Launch

From the repo root, build the test catalog and start a server on a free port. The test catalog includes `test-pack`, which the feature map uses.

```bash
pnpm exec node scripts/build.mjs --test
PORT=4173
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory dist >/tmp/patchquest-verify.log 2>&1 &
echo $! >/tmp/patchquest-verify.pid
```

Ready means the HTML is served and the mission list has rendered. Poll until both are true.

```bash
curl -sf -o /dev/null "http://127.0.0.1:${PORT}/"
node --experimental-strip-types .cursor/skills/verify-patchquest/drive.ts doctor "http://127.0.0.1:${PORT}"
```

`doctor` exits 0 only after the heading `PatchQuest` is visible. A bare HTTP 200 is not ready. IndexedDB is created in the browser profile for that origin, so a fresh Playwright context starts with an empty progress store. Two ports do not share progress. Do not drive a server this run did not start.

## Doctor

Read-only. Run it before a drive whenever the page looks wrong.

```bash
node --experimental-strip-types .cursor/skills/verify-patchquest/drive.ts doctor "http://127.0.0.1:${PORT}"
ps -p "$(cat /tmp/patchquest-verify.pid)" -o args=
```

Pass when `doctor` prints `ready` and the process args contain `http.server`, the same port, and `dist`. Fail when the pid is dead, the port answers with another process, or the heading never appears.

## Drive

Run one recipe in one browser session. The recipe is JSON. Selectors are roles and accessible names from the UI.

```bash
node --experimental-strip-types .cursor/skills/verify-patchquest/drive.ts run path/to/recipe.json
```

Recipe fields are `baseURL`, `evidenceDir`, and `steps`. Optional `viewport` is `{ width, height }` in pixels. Each step is an object with `action`.

- `goto` with `path`. Optional `blockIndexedDB: true` installs the block before that navigation.
- `click` with `role` and `name`. Optional `exact: true`, `namePattern` (a regular expression source), and `within` (a CSS selector that scopes the search).
- `press` with `key`.
- `upload` with `within` and `file` (`name`, `mimeType`, and either `text` or `savedAs`). `savedAs` reads a file this recipe already wrote under `evidenceDir`.
- `expectVisible` or `expectHidden` with `role` and `name`. Optional `exact` and `within`.
- `expectCount` with `text` and `count`. Optional `within` limits the search to a CSS selector.
- `expectTitle` with `text`. The document title must match exactly.
- `expectText` with `role`, `name`, and `text` (array or string). Optional `childRole` checks those descendants instead of the element itself.
- `download` clicks `role`/`name` and writes the file into `evidenceDir` as `saveAs`.
- `screenshot` with `file` (a name only, written under `evidenceDir`).
- `scroll` with `role` and `name`, optional `exact`.

The feature files list the steps for each journey. Start from a fresh browser context. The script does that for every `run`.

## Evidence

Save shots and downloaded files under `evidenceDir`. The default in the feature map is `/tmp/patchquest-verify-evidence`. A shot must show the control you used and the state after the action. A download proof is the saved file plus the screen you clicked. Do not treat a passing `expect` without a shot as the only proof when the feature file asks for a shot.

## Cleanup

Stop only the pid you recorded. Leave `evidenceDir` in place.

```bash
kill "$(cat /tmp/patchquest-verify.pid)"
rm -f /tmp/patchquest-verify.pid
```

Confirm the evidence files are still in `evidenceDir` after the process is gone.

## Helpers

`drive.ts` is the only helper. Invoke it as shown under Drive and Doctor. Node 22 runs it with `--experimental-strip-types`. The file is executable.

Keep the map honest with `/maintain-verification-skill` when the UI changes.
