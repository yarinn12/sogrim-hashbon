# Regression protection for quiet saves and participant layout

After release 4.40, the user requested a further check that future updates cannot silently reintroduce the pending-save announcement or the oversized block on the participant screen.

## Additional coverage

The existing save-feedback browser scenarios now enter the actual participant route with a real durable outbox in two situations: a fresh application runtime after an HTTP 503 outage, and a browser placed in offline mode. The offline case also keeps that route open during reconnection. Each visit verifies that the hidden status occupies zero height, the participant body starts within 24 CSS pixels of its header without overlap, and the first participant remains in the viewport.

The tests inspect the pending note's identity and content after navigation and verify canonical/personal delivery and queue acknowledgement after recovery. Existing checks for duplicates, lost edits, real application errors and any brief pending-copy flash remain active. The large-text profile explicitly enables the application's local 28px dynamic-type preview for these two scenarios.

The first draft of the new navigation step selected both the hidden background Home button and the participant route's Home button. The test now uses the accessible button named “בית”, matching the control available to the user. No application behavior or persistence assertion was weakened.

## Deliberate regressions

All mutations ran in a detached, isolated worktree based on the released commit, with synthetic HTTP fixtures and no production configuration. Each mutated file was restored afterward. The application source in the working release was never changed.

| Mutation | Detection |
|---|---|
| Return the removed pending announcement from the policy | 18 of 53 focused unit tests failed, including the client-copy guard and online/offline behavior |
| Remove participant routes from the explicit grid selectors | The existing browser regression failed: status height 212px exceeded its 68px allowance for the rendered text |
| Introduce a 280px blank gap above the roster | The expanded restored-outbox scenario failed on the new 24px maximum-gap assertion |

These are assertion failures for the targeted behaviors, not import failures, browser startup errors or skipped scenarios. Logs and screenshots are retained under `work/quiet-sync-future-mutations/`.

## Automation

`tests/userNoticePolicy.test.mjs` and `tests/saveFeedbackPolicy.test.mjs` run through `npm test`. The participant geometry regression in `e2e/mobile-layout.spec.mjs` and the expanded outbox scenarios in `e2e/save-feedback.spec.mjs` run through `npm run qa:mobile` on all five configured profiles. `.github/workflows/qa.yml` invokes these suites for every pull request and every push to main. Its aggregate job fails when a required lane fails, is cancelled or is skipped; flaky browser retries also fail CI.

This verifies automated detection of the covered regressions. It does not claim that every direct deployment path is protected, or that tests can guarantee the absence of every possible future bug.

Local validation passed all 2,870 unit/integration tests and all 15 focused mobile cases covering both outbox journeys and participant layout across five profiles. The two large-text cases also passed after adding an explicit assertion for the 28px root font size. Evidence: `work/quiet-sync-future-unit.log`, `work/quiet-sync-future-mobile-matrix.log`, `work/quiet-sync-future-large-text.log`, and `work/quiet-sync-future-mutations/results.json`.
