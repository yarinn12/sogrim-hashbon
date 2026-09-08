# Account-link interaction — 8 September 2026

The account-link confirmation disappeared before its asynchronous work finished. In the duplicate-review path the UI also remained in the completed review instead of returning to the updated participant roster. This made a working link look unfinished. The runtime now keeps a compact, dismissible progress confirmation, guards repeated confirmation, and returns both entry paths to the roster. Returning early leaves the operation running; completion cannot clear a newer confirmation. A success message is styled as success only when its canonical receipt has been verified. Unacknowledged durable work remains quiet and recoverable.

The underlying route's asynchronous repaint now preserves the active progress dialog's focus and input isolation. Progress omits the already-confirmed impact cards, honors reduced motion, and allows return to participants. The generic confirmation lifecycle, scope checks, financial writes, outbox and acknowledgement requirements remain covered by their existing tests.

## Before and after

Baseline a442e233: the new Android duplicate-review regression failed because no participant roster appeared after completion (`work/account-link-ux-baseline-mobile.log`). Both new held-write regressions failed because the confirmation disappeared instead of showing an accessible busy state (`work/account-link-ux-baseline-sync.log`). The tests ran against unchanged application source before implementation.

After the fix, the four identity journeys passed on all five mobile profiles (20 checks), including persisted money/identity assertions and a single Back action to the event. The initial two independent-client progress scenarios passed for waiting and returning early. The retained suite extends those scenarios to both initiating engines, narrow and landscape viewports, actual clickable return controls, a compact success notice, canonical receipt and payer checks, and the live recipient roster.

The full local unit/integration suite passed 2,874 tests. Fixtures that execute extracted UI functions now explicitly supply the new `importantActionDialog: null` dependency. The obsolete static check requiring every confirmation to disappear immediately now verifies the pre-await processing guard; behavioral lifecycle tests independently prove single execution, error cleanup and preservation of newer dialogs. Existing focus/scroll assertions were preserved. The recipient's own row uses its normal settings action, so the cross-client identity check targets the roster row's participant ID instead of assuming all rows open another participant's profile.

## Verification scope

The final local sync run passed **28/28** with strict browser-error checks (`work/account-link-ux-sync-final.log`). The shipping-source unit run passed **2,874/2,874**, with no skips (`work/account-link-ux-unit-shipping.log`).

The sync suite uses independent Android-profile Chromium and iPhone-profile WebKit browsers, storage, identities and caches with a synthetic CAS backend. Existing scenarios cover offline recipient edits, reconnection, reload, pending recovery, unrelated rejected work and conflicting administrators. Database-backed tests run in the unit suite. Production groups and finances are not mutated by these tests. Browser profiles do not certify physical devices or notification push delivery.

The final GitHub run and release artifact evidence are recorded in the pull request and workspace report. Google Play and App Store publication are separate outcomes from a passing build or web deployment; no store publication is implied by this report.

The rejection-path regression also caught an existing missing error surface: a hard-rejected save restored state but assigned its error only to the account picker's unrendered inline message. The picker now exposes that real error through the existing accessible toast after progress closes. The actual orchestration regression failed on empty feedback before the fix (`work/account-link-ux-rejection-baseline.log`) and passes with its unchanged rollback/receipt assertions. Starting a new confirmed link clears obsolete feedback.

The late-result navigation regression also failed before its guard: a newly opened connected participant profile was replaced by the roster (`work/account-link-ux-navigation-baseline.log`). The same actual orchestration passes after limiting profile completion to the source participant.

The first broad local sync run passed 27/28 including all account-link scenarios. An existing iPhone personal-receipt restart scenario intermittently emitted a WebKit intercepted cross-origin fetch-abort pageerror (also 1/3 on isolated repetition). Network idle alone allowed another periodic poll between the idle observation and reload. Its intended quiescent restart now pauses poll/retry timers, drains existing requests, reloads, and resumes time. It passed 3/3 afterward. Canonical writes, recovery assertions and strict browser error guards are unchanged; mid-request/offline recovery still runs in separate scenarios.

Read-only production checks at 14:44 UTC verified Korea has four active accounts, one Liron, six expenses and a confirmed link. All four personal copies passed in-memory hydration, reload and stale-write preparation checks, plus database-role read permissions. Philippines has six participants and three expenses with valid references, valid financial values and balanced settlement. No production data was changed.
