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
