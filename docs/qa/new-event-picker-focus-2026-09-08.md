# Event name input after currency selection

GitHub QA run `34186054464` completed with four mobile profiles successful and
one flaky first-use scenario on iPhone WebKit. The suite intentionally fails on
flaky tests. The failing trace shows the currency selection finishing, then
`fill("ארוחת ערב")` completing while the following snapshot still has an empty
event-name input. The final saved event used its generated default name. The
other profiles and five local repeats passed, so repetition alone was not used
as proof of a fix.

`restoreNewEventInlinePickerFocus` scheduled an unconditional animation-frame
callback after the choice had rendered. If the user moved to the next field
before that callback, it focused the picker again and could redirect input.
The picker DOM already exists synchronously after `render()`, so keyboard focus
is now restored immediately. No delayed callback remains to steal subsequent
input or focus a later screen. Currency, rounding and repayment choices share
this corrected path.

Five unit regressions cover the next-field focus for all three choices,
immediate keyboard focus, and replacement of the screen before a delayed frame.
All five failed against the original implementation. The new browser regression
holds application animation frames at the currency-selection boundary, focuses
the next input, then releases the frames. It failed on the next-field focus
assertion before the fix. It also checks the typed name, final event heading and
actual persisted local event record. The existing first-use test assertions and
deadlines are unchanged.

The focused 30-test unit suite and all 15 affected browser checks across Android,
iPhone, iPad, large-text iPhone and 200% reflow passed after the fix, with no skips.
These include the original first-use loop, the forced delayed-frame regression
and 20 repeated currency-picker reopen cycles in each profile. After the PWA/native
version bump, the full 2,815 syntax/unit/integration tests passed with no skips.
Further release validation
is recorded in the final delivery report. Private evidence:
`work/korea-picker-focus-unit-red.log`,
`work/korea-picker-focus-browser-red.log`,
`work/korea-picker-focus-red-trace.zip`,
`work/korea-picker-focus-unit-green.log`, and
`work/korea-first-use-trace-summary.jsonl`.

This issue affected new-event input and was found during the broader audit.
Korea's existing linked membership and financial records were verified separately.

Release target: PWA 487 / Android 4.38 (166).
# Offline-test browser diagnostic correction

QA run `34187906930` preserved both devices' two expenses and two notes, but one
offline/reconnect scenario failed its final error-list assertion. The reported
error was WebKit's native `Fetch API cannot load ... due to access control checks`
diagnostic for a deliberately aborted fixture request, not an uncaught app
exception. An isolated page with a caught fetch rejection reproduced the exact
Playwright `pageerror` shape; no application code was needed. Playwright's WebKit
adapter maps every JavaScript-source error-level console message to `pageerror`.
Source: https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/webkit/wkPage.ts

The synthetic two-client fixture now records that precise native diagnostic
separately only when its exact URL was deliberately failed by that client. A new
allowed request clears the URL. Unexpected CORS diagnostics still fail. Independent
`error` and `unhandledrejection` listeners preserve every actual runtime failure,
including an unhandled rejection from that same deliberately failed URL. All
existing financial, persistence, empty-error-list and unexpected-write assertions
remain unchanged. Expected network diagnostics are printed in the test report.

Three browser regressions cover a caught expected rejection, an unhandled rejection
at the same URL, an unplanned CORS failure, and a thrown application error. The
caught-rejection regression failed against the original collector and passes with
the corrected recorder. The other regressions verify the guard still reports real
failures. Starting the recorder earlier also exposed the fixture's attempt to seed
localStorage on `about:blank`; seeding is now limited to its intended app origin.
No production error handler, network behavior or data was changed.

Evidence: `work/probe-webkit-cors-errors.log`, `work/korea-4.38-monitor-red.log`,
`work/korea-4.38-monitor-sync-green.log`. Six additional unchanged offline journeys
(three runs of each reconnection order) passed before this fixture correction.
All 17 tests in the corrected independent-browser suite passed locally, with no
failures or skips. The 624-file packaged runtime fingerprint remains unchanged.
