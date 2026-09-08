# Korea / Liron account link — 8 September 2026

The requested guest-to-account link was committed through the existing authenticated `update_shared_event_snapshot` RPC. The existing authorization, financial integrity, membership and CAS guards remained enabled. The operator was verified as the active event administrator; the destination was an existing active account, not a new access grant.

The event changed from five participants to four. All four expense IDs and amounts, four transfer IDs, amounts and payment statuses, and every person's balance (combining the two Liron identities) were checked before and after the write. Total expense value remains 829,200 minor units. A separate read-only transaction confirmed the canonical link after commit. Pre-change snapshots and the prior SQL function definition are retained privately in this task's work directory.

## Observed failure and fix

The Chrome UI on PWA 479 reproduced the secure-link preparation failure. Anonymous metrics did not identify an underlying error for that original UI attempt, so its exact exception is not proven. During the targeted authenticated RPC investigation, PostgreSQL repeatedly exceeded a 50-second statement timeout. Its exception context identified `private.sync_shared_event_notes_to_workspaces` rewriting a personal snapshot. Activity sampling found active execution, with no blocking PID, rather than a lock wait.

Membership changes invoke note mirroring even when all existing members already have identical notes and participants. The mirror unconditionally rewrote entire personal snapshots, invoking their guards and projections and advancing their versions. The migration adds a strict no-op check only after normal membership lookup, workspace locking, conflicting-index checks, event projection and missing-participant computation. Changed notes, deletions, missing indexes and missing participants retain the atomic write path.

The precise live function body was checked against the reviewed baseline before replacement. The migration and actual link were installed in one transaction. A prior live preview with the fix succeeded and was rolled back. The final committed RPC took 9,939 ms; the rolled-back preview took 35,863 ms. This variation does not establish a general latency guarantee or prove that every mobile attempt will fit its request timeout. No frontend or mobile package was released by this task.

An intermediate maintenance adapter produced false CAS conflicts because postgres.js serialized a typed timestamp parameter through JavaScript Date, dropping microseconds. The adapter was corrected to cast through text, preserving the exact PostgreSQL version. Those adapter conflicts are not evidence of a product concurrency defect. All failed maintenance transactions rolled back.

## Regression and validation

- Extended the existing database-backed full-wire account-link test, including its forced CAS retry, to seed established personal note projections and assert that their versions do not change for the link. Debt remapping, stable financial record IDs, recipient RLS and recipient hydration checks remain.
- Before the change, the regression failed because all four personal versions advanced. After the change, it passed.
- The nearby create/edit/delete note-mirroring test passed and still checks replication to all four accounts.
- Normal syntax and unit/integration suite: 2,747 passed, zero failed/skipped.
- Independent Chromium/WebKit synchronization suite: eight passed, including the link with a durably pending unrelated event. These browser backends are synthetic; the SQL regression independently exercises PostgreSQL guards.
- A live read-only projection check confirmed the four established workspaces had identical notes/deletions and no missing participants before the link.

Logs: `work/korea-mirror-noop-red.log`, `work/korea-mirror-noop-green.log`, `work/korea-mirror-full-unit.log`, `work/korea-mirror-sync.log`, `work/korea-liron-applied-root.log`.

The shared checkout contained concurrent, unrelated client synchronization changes. This task changed only the SQL mirror implementation, its migration/verification/rollback files, the existing database regression, and this record. No unrelated pending user intent was cleared. The SQL rollback restores previous mirror behavior and does not reverse the completed participant link.

## Follow-up: an old synchronization write erased the link receipt

After the first commit, a separate read initially confirmed the link, and Chrome briefly displayed four members. A later write kept the four-member canonical roster and remapped money but dropped the newly committed `participantAccountLinks` entry. Chrome then returned to an old five-member personal copy. This was observed after commit, not merely predicted by the test.

The event merge currently spreads the local event over the remote event without an explicit union for this receipt array. Old clients can therefore submit the new membership and amounts with an older receipt array. The database previously accepted that omission.

The second migration adds a trigger that preserves omitted committed receipts, rejects a changed/duplicated receipt for the same source, and rejects re-addition of a previously linked guest. It runs before the existing guards, which remain enabled and still authorize new links and financial changes. Full event deletion keeps its existing authorization path. This protects existing clients without requiring a new mobile package.

The regression demonstrated that the old server lost the receipt; the corrected server retains it, rejects resurrection and retargeting, and still passes note replication and actual-link RPC tests. Each rejected write uses a savepoint so both rejection cases exercise the intended guard. The existing schema/migration equality assertion was bounded at the new migration marker and extended to compare the new migration exactly.

Final normal syntax and unit/integration suite: **2,748 passed, zero failed/skipped**. The targeted incremental-install run passed all four selected database scenarios. The earlier eight independent-browser scenarios remain separate synthetic-client evidence; no additional browser transport code changed in this second fix.

The guard and receipt restoration were committed together. The existing four-member roster and all remapped expense/payment data were verified against the pre-link backup and left unchanged. The restored receipt records the time of its restoration. Logs: `work/korea-link-receipt-red.log`, `work/korea-link-receipt-green.log`, `work/korea-link-final-unit.log`, `work/korea-link-upgrade.log`, `work/korea-link-receipt-applied.log`.

## Final live verification

Both production verification SQL files passed in a read-only transaction. A later independent canonical read returned `already-linked`, with the committed Liron receipt present. Chrome was reloaded, then Korea and its participant roster were reopened: four participants, one Liron Abraham (@liron), and no manual Liron entry. Before reloading, the event total was 8,292 shekels and the owner's net receivable was 739 shekels, matching the pre-link values.

A proposed bulk refresh of personal event copies was not applied. Its read-only preview stopped because three older copies contained pending settlement suggestions calculated before the latest expense. No completed payment was found in those differing suggestions. All personal copies, unrelated events and pending user intent were left intact; normal canonical hydration supplied the verified four-person Chrome roster. The general pending-sync indicator remains visible, so this result confirms the requested link rather than completion of every account-wide pending save. No physical phone was inspected.
