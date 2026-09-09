# Cross-user synchronization regression audit — 2026-09-09

Baseline: `f1bc62384d5a783f94a4d04f333f010793dce239` (4.48), isolated in a separate worktree. Synthetic identities and data only; no production customer records were modified for testing.

## Confirmed failures and fixes

1. **A canonical event deletion was lost by batched synchronization.** `saveSharedEventState` returned the tombstone, but `syncSharedEvents` retained the live local event. Save, outbox flush, startup recovery and a partial sibling failure could then persist the deleted event into the personal workspace. The batch now adopts the confirmed deletion and its share credentials.
2. **Deleting an event with payment history failed the database guard.** Generic array merging retained live participants and changed envelope metadata in a deletion request. The deletion writer now replaces the event envelope, preserves unrelated canonical metadata, and retries using the latest CAS version. Administrator authorization is unchanged.
3. **A deletion committed during a write conflict caused a synchronization failure.** The retry required a live event after reading a confirmed tombstone. It now adopts that canonical result without a second attempt to recreate the event.
4. **Stale replicas overwrote participant nicknames, including cleared nicknames.** A stale administrator could replace the new nickname; an ordinary member's note save could fail with SQL 42501 because its payload tried to change an administrator setting. Each nickname now has an independent, monotonic version. Concurrent changes to different nicknames and unrelated event settings are preserved.

The alias SQL migration extends the existing timestamp guard. It rejects invalid/new future alias clocks, preserves unchanged historical values, and leaves the private function inaccessible to application roles. Fresh schema, incremental upgrade, repeated application, actual RPC permissions and linked-account history are tested in PGlite/PostgreSQL.

## Regression evidence

- 11 deletion tests on baseline: **10 failed, 1 permission control passed**. The corrected code passes all 11.
- An additional end-to-end SQL case verifies that the former member can read the administrator's paid-event tombstone through real RLS and that the member's batch adopts it without attempting a write. It fails on baseline and passes after the fix.
- 5 alias reproduction/control tests on baseline: **4 failed, 1 unrelated-setting control passed**. Includes a real database-backed member write. All pass after the fix.
- 4 independent-browser reproductions on baseline: **all failed for the intended persisted-data assertion**. All pass after the fix, with Android/Chromium and iPhone/WebKit each acting as administrator and offline peer.
- 28 new tests in the normal suite and 4 new two-client browser cases. Additional controls cover invalid clocks, idempotent migration, same-millisecond edits, full participant identifiers, deterministic equal-version clearing, rejected receipts, concurrent edits and account linking.
- Local normal suite on the fixed 4.48 base passed without failures or skips; the final report contains the completed count including the additional RLS case.

The database and transport tests inspect the final request, committed row/receipt and adopted state. Browser cases inspect the canonical event, independent personal storage, personal cloud snapshot, durable outbox and final peer write; the deletion case also reloads both clients. Browser errors and unexpected requests still fail the suite.

## Coverage boundaries

| Area | Automated coverage |
|---|---|
| Concurrent notes, expenses, payments and settings | Two-client suite, shared-state merge, conflict retry and SQL integrity tests |
| Offline work, restart, partial failures and delayed receipts | Two-client suite, scoped queue, offline resilience, shared partial failure and storage receipt tests |
| Account switching and stale callbacks | Ownership tests for resume, visible events, account scope, UI actions and payment completion |
| Membership discovery, invitation joins and revoked access | Shared membership index, foreground synchronization, invitation and SQL/RLS tests |
| Guest/account linking and historical payment identity | Database integrity and independent-browser linking races |
| Event deletion and participant nicknames | New reproductions listed above |

Playwright uses separate browser engines, contexts, identities, storage and synthetic CAS endpoints. Database tests execute the actual schema, RPCs, triggers and permissions locally. These are not physical-device tests or a live multi-user production exercise. They do not establish that all possible failures are impossible.

## Test fixture corrections

- Outbox flush returns `{ok: true}`, unlike the save receipt. Its test now checks that contract plus actual workspace writes and durable state.
- The SQL adapter must execute the RPC before constructing the HTTP response. Deferring SQL execution into `response.json()` incorrectly let the JSON reader mask a database exception.
- The alias SQL fixture now seeds the production `buildSharedEventState` envelope; an extra top-level deletion array had caused an unrelated metadata rejection.
- The browser alias flow opens the participants dialog first. Resolving a duplicate pair already opens/focuses the nickname section; toggling the section again hid the editor. Final corrected scenarios were rerun against baseline and fixed code.
- The old source-string assertion requiring whole-map alias rollback was replaced by real-handler rollback tests. Awaited persistence and authorization assertions remain. A rejected alias restores only its own previous value/version and cannot erase a concurrent edit.
- The existing join/restart scenario passed its reload, storage and cloud assertions, then intermittently emitted WebKit's native CORS diagnostic during a second forced document navigation to `/`. It now returns through the application's home action after the same explicit reload. The browser error recorder, all error assertions and persisted-data checks remain unchanged.

## Deployment

Apply `scripts/apply-participant-alias-versions.mjs --apply` using the existing secured database configuration before releasing the corresponding clients. Its verification script checks the deployed guard and private execution permissions. Versioned clients preserve old unversioned nicknames until edited. The migration does not change sign-in configuration or secrets.

Final CI, publication status and evidence are recorded in the release report separately.
