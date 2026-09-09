# Sequential event deletion regression

When an event deletion was rejected after another removal confirmation opened, `deleteCurrentEvent` restored the earlier event and also forcibly navigated to its event screen. A successful older request could overwrite the current deletion's progress notice, including after switching accounts. In addition, `confirmImportantAction` kept the global browser-history suppression flag enabled for the whole network wait, so the next event menu was missing from back/forward navigation.

The fix restores rejected data without changing the user's current screen, checks save/account ownership before reporting a deletion completion, and limits history suppression to the action's immediate synchronous transition. Existing explicit confirmation and permission checks remain in place.

Behavioral reproduction on the unmodified 4.47 source:

- Four of five new unit tests failed: earlier rejection replaced the home or profile screen; older success replaced the next deletion's progress or another account's notice. The existing-safe late rejection after an account switch passed.
- iPhone WebKit reproduced a rejected earlier deletion taking over the next confirmation's home screen (`event` instead of `home`).
- A separate iPhone WebKit test reproduced the missing second event menu after browser back/forward while the first deletion was paused.
- Three consecutive successful deletions were a passing control. The final canonical deletion payloads, personal snapshot and reload were verified.

After the fix, all five unit regressions and all nine browser runs of the three scenarios passed across Android, iPhone WebKit and iPhone enlarged-text profiles. The normal suite passed 2,978 tests without skips or failures. The successful sequential-deletion control was then expanded to 40 initial events, with assertions that the remaining 37 event IDs survive. Nearby home-menu/settings checks and integrated release checks are recorded in the release report.

One existing source-shape assertion expected the exact text `await executeImportantAction(pendingAction)`. It now checks that the duplicate-submit guard is established before `executeImportantAction(pendingAction)` is invoked, independent of whether its promise is awaited on the same line. It still requires the call and the same guard; it does not weaken duplicate-submit protection.

Tests are synthetic and isolated from production. Browser checks execute the real application and store against an intercepted backend, including held replies and HTTP 403. They verify client handling of rejection; they do not claim a new database authorization test or a physical-iPhone run. No actual user events were deleted.

Entry points:

```text
npm test
npx playwright test e2e/sequential-event-deletion.spec.mjs --project=iphone-webkit --project=android-mobile --project=iphone-large-text
```

The regressions are in the normal `tests` and `e2e` directories and run in GitHub QA. Original failing logs, traces and post-fix results are retained in the task's `outputs/event-deletion-evidence` directory.
