# QA440 Firefox pin-navigation regression

Source: `eaecfa0761aa80b3701b329b30393899510d6844`, isolated detached worktree `work/firefox-pins-eaec`. Patch: `firefox-pins-eaec.patch`. Only `e2e/pinned-events.spec.mjs` changes. No PR56 or application file was edited.

## Cause and original evidence

QA440 cross-platform job `114950536109` recorded one flaky failure: `e2e/pinned-events.spec.mjs` waited in `other.goto('/')` for `load` until the unchanged 90-second test limit. Its retry passed, but `failOnFlakyTests` correctly failed the job. The trace shows an HTTP 200 document and a rendered home in the new tab while the navigation call was still pending. It does not identify the exact resource or browser event that prevented `load` from settling. The test's readiness assumption was too strict for a usable home.

Artifact: https://github.com/yarinn12/sogrim-hashbon/actions/runs/38290746842/artifacts/11767213120

## Controlled before/after regression

The test now holds a synthetic, nonessential home image in the second tab. This reproduces the observed boundary deterministically: the home renders while the browser `load` event remains pending. With the old `other.goto('/')` line, the focused Firefox test failed after **90 seconds** at that exact line and error. The final test uses the existing `openRenderedHome` helper to require a fresh document, target URL, timely app boot and visible home while still rejecting navigation/HTTP errors, stale or hidden homes. It asserts the image was requested and `document.readyState` is `interactive`, then exercises every original pin, ordering, local persistence and closed-menu assertion while the image remains held. The resource is released in `finally`.

Final focused regression: **4/4 passed** (desktop Chromium, Firefox, WebKit, compact Firefox). Nearby pin and Firefox navigation-readiness suites: **62/62 passed**. The normal local `npm test` unit/integration suite: **3639/3639 passed**. The suite's 90-second test timeout, retry policy and all original pin/account/persistence/concurrency assertions remain intact. `git diff --check` and reverse patch check passed.

These are local synthetic browser tests. They prove the test can finish when a nonessential load resource is pending and the new home is actually ready. They do not identify the precise pending resource in the original Linux Firefox run or measure production response latency. No CI rerun was triggered.
