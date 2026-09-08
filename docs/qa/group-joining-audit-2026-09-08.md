# Group joining audit — 2026-09-08

Baseline: `a548d1be2ef68c9ab6ed114cc2c721e39ee072da`.
All accounts, invitations and financial records used here are synthetic. No production group, account, invitation, expense or membership was changed.

## Findings and fixes

1. A retryable `EVENT_MEMBERSHIP_INDEX_PENDING` error during account connection escaped into the terminal invitation branch, which deleted the login/registration handoff. Account connection now retains retryable invite failures, completes normal account bootstrap without inventing membership, and leaves the URL to the existing automatic invitation recovery. Permanent revocation, expiry and recipient mismatch still surface as errors. Generic `EVENT_INVITES_UNAVAILABLE` already had a separate offline-resume fallback in the old bootstrap; it is a compatibility control, not evidence of the handoff-loss bug.
2. Manual invitation handling checked only the draft reference. Cancellation retained that draft, and account changes could occur while a request was in flight. The continuation now also checks its screen, account and session generation, including after its fallback state read. A redemption already committed on the server keeps its original owner-scoped recovery receipt.
3. Successful manual joining cleared the draft before the finally block's render guard. The destination was set but not immediately painted. Success now explicitly renders the joined group.

## Regression protection

`tests/joinConnectionAudit.test.mjs` adds 21 behavioral cases: temporary invite failures across existing login/OAuth reload, subsequent successful redemption with the original token, permanent failure controls, immediate manual navigation, and config/redemption/read/save completions crossing navigation or account/session boundaries.

An isolated copy of these tests against the exact baseline produced **17 failures and 4 passing controls**; the fixed code passes all 21. Production files were never overwritten for ablation. Evidence: `work/join-audit-regression-final-red.log`, `work/join-audit-regression-green.log`; preparation script: `work/prepare-join-audit-baseline.mjs`.

The browser ablation serves the old app/auth modules to real Chromium/WebKit pages. The old membership-index failure deletes the durable handoff (`work/join-audit-browser-auth-red.log`). The old late manual response leaves the home projection inconsistent (`work/join-audit-browser-red.log`). Their normal browser tests pass with the fixes.

Five new actual PostgreSQL/PGlite cases verify revoked links, wrong private recipients, explicitly removed members, repeated private acceptance, and a connected joiner beside an offline namesake. Membership, canonical snapshot, personal discovery, financial rows and invitation receipt are inspected together; rejection uses transaction savepoints. The namesake seed uses the real settlement function so the initial expense payload satisfies the database's settlement constraint.

Six new independent-client browser journeys cover Android/iPhone link opening, signed-out login with no pre-auth membership, offline expense creation after joining, reconnection, restart and home discovery, retryable membership-index failure, and cancellation before the server response. These exercise the real UI and client persistence against an explicit authenticated CAS fixture. The fixture models the API contract; it does not prove PostgreSQL authorization. The separate SQL tests exercise that boundary.

## Verification

- Normal `npm test`: **2,852 passed**, zero failures/skips (`work/join-audit-unit-final.log`). Includes syntax checks and actual database integration.
- Invite SQL matrix: **11 passed** (`work/join-audit-sql.log`).
- Entire database suite in incremental-upgrade mode: **150 passed** (`work/join-audit-sql-upgrade.log`).
- All six new browser journeys: **6 passed** (`work/join-audit-browser-six-final.log`).
- Relevant mobile/authentication suites across all five configured profiles: **39 passed, 1 device-specific skip** (`work/join-audit-mobile-complete.log`). These are the relevant 40 cases, not the entire 855-case mobile matrix.
- Full synchronization suite: **24 passed**, zero failures/retries/skips (`work/join-audit-sync-verified.log`).

## Test-fixture corrections and limitations

- A new success fixture initially supplied a too-short shared-space key; it now supplies a valid synthetic key without changing production validation.
- The current Home UI does not expose the retained manual-launch control. External link journeys use real link navigation. The manual cancellation browser test injects only a launch button for the existing handler, then uses the real form, submit and cancel controls. No app functions are mocked.
- Reloading a cleaned invite correctly preserves its event destination. Tests verify that destination and separately navigate Home to verify discovery; they do not assume reload automatically goes Home.
- Invitation bootstrap calls `set_friend_username`. The fixture now implements that exact existing-username operation, checks its authenticated caller and expected username, and still rejects unimplemented writes.
- WebKit can fail requests at its context-level offline switch before the route callback runs. The fixture records only requests from the explicitly disconnected client and the exact synthetic backend URL, using the existing native diagnostic guard. Real runtime errors/unhandled rejections and unplanned CORS failures remain test failures; the three error-monitor tests remain in the suite. Journey assertions additionally check each navigation/offline/reconnect/reload boundary. The new offline cases wait for acknowledged membership and settled page loading before the next intentional navigation; interrupted-join cases remain separate.
- The first mobile subset run had one Google-session test failure after reload on the large-text iPhone profile (38 passed, 1 skipped, 1 failed). Its unchanged normal test then passed three repeats; ten additional instrumented repetitions also passed. The whole subset subsequently passed 39/40 with the one expected skip. The original failure was not reliably reproduced or assigned a proven root cause; it is not claimed fixed. Evidence is retained in `work/join-audit-mobile.log`, `work/join-audit-google-repeat.log`, `work/join-audit-google-probe.log` and `work/join-audit-google-trace.log`.

No real Google/Apple provider login, confirmation email delivery, installed physical-device journey, production Korea/Philippines mutation, or new store release was performed by this audit. Registration handoff is covered by existing durable-invite tests plus the account-connection/OAuth-reload regression cases. Test coverage establishes the listed scenarios, not absence of every possible bug.
