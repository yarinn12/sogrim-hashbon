# Small action reliability audit — 2026-10-03

Publication is deferred. These changes extend draft PR #38 and do not apply the SQL migration, deploy the website or replace the Google Play build.

## Reproduced failures and fixes

Two shared causes affected adjacent event controls:

1. A rejected lock, close, reopen, self-leave, member removal, restoration, addition or administrator change replaced the entire pre-request state. A read from another device can update memory and durable storage without advancing the local save revision, so this replacement discarded incoming notes, expenses and other event changes. The local store used the same broad fallback before notifying the UI.
2. Successful close, reopen, administrator, restore and add completions lacked the ownership check already used for failure. After an account switch or a newer save, the old completion could change feedback, render the current screen, rewind navigation or start an invitation using the new account.

`eventControlRollback.mjs` recognizes control-only snapshots and undoes only values and clocks still owned by the rejected write. Membership is compared per participant; lifecycle and administrator decisions use their own clocks. It preserves newer decisions, other members, incoming content, payment confirmations and activity, and removes the failed action's receipt. It does not mint a new mutation clock, revive a deleted event or alter another account. Closure-generated pending transfers are validated against the settlement calculation; an independent payment edit cannot be absorbed by this classifier. Mixed mutations retain their existing policy.

Both the UI and durable local store use the same idempotent undo. Completion ownership is checked before success handling and again after awaited invitation work. The new module is included in the service worker's essential offline cache.

## Regression evidence

37 tests were added to the normal suite:

- 13 UI handler cases, including account changes, newer saves and rejected controls with concurrent remote content.
- 5 actual local-store final-RPC rejection/retry cases: lock, reopen, grant administrator, remove member and self-leave. They inspect storage before the revert event, outbox cleanup, the final canonical request and the subsequent successful acknowledgement.
- 18 undo behavior cases: immutable/idempotent recovery, old-clock restoration, independent membership, newer same-value revisions, retained paid transfers, negative mixed-write classification, deleted events and account boundaries.
- 1 additional recovery-helper exception case.

With the relevant production files from `69fb5ec907987bd34b0fc61d72a6d03502305c94`, the new UI checks fail **13/41** and the final-RPC checks fail **5/5**, specifically because concurrent content disappears or old completions affect the current screen. The isolated baseline runner restores the exact working files in `finally`. With the fix, the focused five-file run passes **166/166**, with zero skips.

The peer-note fixture creates the incoming receipt in an open snapshot, then delivers it during the waiting lock/reopen/leave request. Creating a note directly in the optimistic locked/departed snapshot correctly fails domain permissions and would not reproduce an incoming committed note. This fixture correction preserves the permission check and the concurrency assertion.

Two existing source-shape assertions were updated to require the new narrow recovery call. No behavioral assertions were removed or weakened. The existing payment-reset VM fixture now supplies the same completion-ownership dependency as the real app; its stale-peer, conflict, offline and permission assertions remain intact.

## Verification boundaries

- Local normal suite: **3,237/3,238 pass, zero skips**. The one unavailable check is creation of a Windows directory junction in `privateSecretCustody.test.mjs`, rejected by this sandbox with `EPERM`. It remains enabled and is also run by Windows and Linux CI.
- The normal suite includes real PGlite PostgreSQL permission and final shared-event-write tests from the preceding leave fix. The new local-store rejection transport is synthetic HTTP 403; it is not evidence of live database RLS behavior.
- Browser checks use Chromium Android and WebKit iPhone profiles, isolated storage and synthetic data. The separate two-client suite uses independent identities, browser engines, storage and compare-and-swap responses. It does not test production push delivery or installed native builds.
- The prior broad CI run for `69fb5ec...` passed unit, two-client sync and four mobile lanes. Its Android lane failed the flaky-test gate after a single `socket hang up` reading the local test server in `pinned-events.spec.mjs`. The test and gate remain enabled; a retry pass was not counted as a successful run.

Final candidate CI and browser results are recorded with their exact source SHA in the task's evidence directory. The checks protect these scenarios and do not certify that every possible application defect is absent.
