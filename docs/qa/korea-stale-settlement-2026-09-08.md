# Korea: stale replica settlement verification, 2026-09-08

The live Korea event has four account participants, one confirmed Liron identity,
four expenses totalling 829,200 minor units and four pending transfers. The owner's
net receivable is 73,900 minor units with the group's existing rounding settings.
No expense, payment, note or membership was changed by the production audit.

## Findings and fixes

1. A stale replica contributed obsolete pending transfer rows alongside the
   canonical rows. Their union invalidated the existing exact settlement plan.
   Recalculation could change transfer IDs and redistribute rounded routes,
   including an unnecessary one-shekel transfer, without changing net balances.
   Authenticated read hydration and every write/retry now preserve the validated
   canonical plan when the expense records, members, settlement settings, paid
   history and payment status updates agree. New expenses, payments and reversals
   still take the normal reconciliation path.
2. For older events without per-participant clocks, a different ordering of the
   same members could be published by a non-admin as a settings change. The exact
   SQL guard correctly rejected it. The final member write now uses canonical
   membership array ordering when the membership is unchanged. Actual membership
   changes and newer per-participant evidence remain intact; server permissions
   were not relaxed.

## Regression evidence

The new synthetic fixture reproduces the four-person rounding and stale transfer
pattern without production account identifiers. Against original commit
`a0089b0036711989d28532579372fc8d79fcb023`, all four selected regressions failed:
read stability, write stability, final SQL write stability, and legacy membership
ordering. With only the settlement fix installed, the final SQL write still failed
with `Only an event admin can change event settings`, and the isolated membership
test failed. Both pass with the complete fix.

The SQL regression uses the actual authenticated role, snapshot RPC, final JSON
payload and acknowledgement, with a forced first-attempt CAS conflict and a second
successful write. It asserts exact transfer IDs, parties and amounts, all four
expenses, returned state and database state. New payment confirmation, payment
reversal and offline expense-edit checks remain enabled.

An initial SQL fixture contained a workspace-only `deletedEvents` envelope field.
It was removed to match `buildSharedEventState`, as the existing member transport
tests already do. Both baselines were rerun with the corrected fixture. No SQL
authorization assertions were removed or weakened.

Validation before packaging: 2,810 syntax/unit/integration tests passed with zero
failures or skips; all 14 independent Android-profile Chromium / iPhone-profile
WebKit synchronization scenarios passed. These use isolated synthetic backends;
the SQL suite separately exercises PostgreSQL authorization and final writes.
The release candidate also passed 10 targeted mobile/browser checks: Korea's
direct settlement display, account hydration, fresh installation, disconnected
reload, origin outage and service worker update. Two iOS-only cases were correctly
skipped in the Android project. Android AAB/APK packaging and release lint passed;
181 packaged web assets in each artifact matched the prepared source.

## Actual group verification

A repeatable-read, read-only production audit checked the canonical event, all
four active memberships and all four personal workspaces. Liron and Maor's embedded
copies predate the latest expense. Running the real hydration and write preparation
code in memory restored all four expenses with identical financial records, notes
and transfer routes. Repeated hydration and JSON persistence/reload remained stable.
The final non-admin payloads also matched the SQL-protected settings/envelope.
Every participant passed a database-role read probe for the shared event and their
own workspace. These are not signed-in phone sessions.

Both deployed database guards were verified in the same read-only transaction:
no-op note mirror protection and committed account-link preservation. The live
Chrome UI showed one Liron, four expenses, the expected four transfer routes and
no sync warning inside Korea. Notes and the new-expense form opened; the empty
form was cancelled without saving. A general account-wide warning from other
pending work remains outside the Korea verification scope.

Evidence logs (private workspace): `work/korea-both-fixes-red.log`,
`work/korea-membership-only-red.log`, `work/korea-stable-plan-focused-after.log`,
`work/korea-release-4.37-unit.log`, `work/korea-two-client-after.log`, and
`work/korea-4.36-readonly-final.json`.

Release target: PWA 486 and Android 4.37 (165). Native Apple publication still
requires the previously missing Apple signing/account configuration. Physical
participant phones were not inspected; this verification does not establish that
all devices have installed the update or that no other bugs exist.
