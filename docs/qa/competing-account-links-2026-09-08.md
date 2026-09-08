# Concurrent account-link audit

The audit starts from `9ba83b5c7a4505fdcc7bb5ce46937ae99739899c` (published 4.38). It uses synthetic local data only. No production event, expense, payment, profile or pending queue is changed.

## Reproduced defect and correction

Two administrators can prepare links from the same original roster, selecting different connected accounts for one guest. If the first link reaches the canonical event while the second device holds a newer local expense timestamp, canonical hydration previously replaced the second link's receipt without detecting its conflicting target. Its already-remapped expense could then look like an ordinary newer edit. In an open event without transfer records, the final client RPC was accepted by PostgreSQL with a receipt pointing to one account and the expense payer pointing to the other.

The initial probe with an existing transfer was rejected by the SQL payment-attribution guard. Extending it to events without transfers exposed the actual gap; the existing SQL guard was not sufficient for that state. This is not evidence that the reported Korea merge failed for this reason.

`applyCanonicalEventAccountLinks` now rejects a local receipt selecting a different target for a source already linked by the authenticated canonical event. It checks before remapping or replacing receipts, including foreground hydration and every CAS retry. The error has code `SHARED_EVENT_ACCOUNT_LINK_CONFLICT` and status 409. Existing failed-save handling rejects the local operation; this is not a transient network error to retry indefinitely. No SQL authorization was loosened and no data was silently discarded to make the tests pass.

Identical links at different attempt times remain valid, as do links for different guests and different groups. The guard does not prevent an explicit later expense edit when the committed identity receipt agrees.

## Regression evidence

- `tests/databaseIntegrity.test.mjs`: four competing-link scenarios cover a canonical decision already present on the first read or committed between read and write, with and without a pre-existing transfer. They use the actual client serialization, real PostgreSQL authenticated RPC, actual CAS mismatch, final database rows and preserved expense totals. Two positive SQL cases cover repeated identical links and independent guest links.
- `tests/competingAccountLinks.test.mjs`: five cases cover hydration failure without mutating either input, non-retryable classification, identical receipts at different times, group isolation, separate guest links and deliberate later expense edits.
- `e2e-sync/two-client.spec.mjs`: two independent browser engines and authenticated administrator identities prepare conflicting links through the real UI. The first operation is held until the second has a newer local timestamp; the writes are then released in a controlled order. Every accepted write must preserve the winning identity and expense payer. The rejected device clears only the rejected operation's queue and displays the canonical roster and expense after restart.

The SQL control failed on the actual stored payer in both no-transfer cases before the fix (`work/full-code-audit-competing-link-shapes-red.log`). The fixed six focused SQL cases passed (`work/full-code-audit-sql-link-matrix.log`).

The browser control serves the immutable pre-fix `sharedStateMerge.mjs` from the baseline commit to a separate test server; it does not overwrite the working source. It fails on an accepted write whose payer is the losing account (`work/full-code-audit-competing-link-browser-red.log`). The same UI race passes with the fix (`work/full-code-audit-competing-link-browser-green.log`). An initial ordering prepared the losing link first and did not expose the timestamp race; it was strengthened, not treated as regression evidence.

## Test-fixture corrections

The first SQL probe needed a savepoint around each rejected RPC, because a rejected statement aborts an explicit PostgreSQL transaction; the savepoint permits inspecting the unchanged committed row. The unrelated-group fixture needed a valid existing settlement plan before checking whole-event equality, because normal hydration calculates a missing plan. Neither change alters application behavior or weakens the financial or authorization assertions.

The first mobile run was stopped deliberately after the Android profile completed, to restart all five profiles against the final runtime in independent local servers. Each final profile uses the normal test files, device definition, assertions and timeouts, zero retries, and a separate state file and result directory. The interrupted run is not counted as the final matrix.

## Validation status

The initial normal suite passed 2,815 tests. After the runtime fix, the next full normal suite passed 2,824 tests; two further positive SQL cases bring the final inventory to 2,826. All 145 SQL integration tests also passed in schema-upgrade mode.

Final coverage, synchronization and mobile reports are recorded under `work/full-code-audit-*`; their final results are summarized in the task's user-facing report after all runs finish. The coverage report is not a claim of 100% path coverage. Browser profiles are not physical participant phones. Publication is a separate action; this audit alone does not update an installed 4.38 APK.
