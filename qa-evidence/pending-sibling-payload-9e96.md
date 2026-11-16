# Pending sibling content must survive a stale bootstrap snapshot

Baseline: public source `9e96d419485e9d37506da3c7089954d9bf0e826b`, tree `53280c77a6a2c257fcb0fa1612b83f70302fff03`.

The first Android browser run was rejected as flaky, not accepted on retry. Job `114332901944` reported the pending-permission note missing from its outbox. Artifact `11685520737` was downloaded and verified as SHA256 `029d0f55af69373777c984fa50c39c6feb3c1276854dab0e1ffa10988e02413b`.

Independent trace inspection found the first final RPC to the pending sibling included `pending-permission-note` and received HTTP 403. Later RPCs contained `notes: []`, without an acknowledgement. The final durable outbox still listed the sibling in its delivery selection but no longer contained the note. A bootstrap/profile snapshot could predate pending-intent hydration. Saving that snapshot unioned the previous delivery targets while replacing their actual content.

The fix merges only the selected pending event projections and selected event tombstones into incoming state before the crash-safe outbox write. Existing domain merge clocks keep newer notes, deletions and membership changes. Event credentials are retained. Projection limits participants to the event and excludes private groups and other private lists. The merged snapshot is used for the final shared and personal write, not just the pending-status indicator.

Permanent regressions in the normal unit/integration suite cover stale profile bootstrap and a different-event save. They check the actual final RPC payload, durable note and delivery selection before acknowledgement, then shared and personal snapshots after recovery and acknowledgement. A third case verifies an intentional newer note deletion and removal of a private group do not get resurrected.

Before/after evidence on the exact source:

- Original implementation: both new payload regressions RED. The profile case failed the final RPC assertion; the different-event case failed the durable-content assertion.
- Fixed implementation: both GREEN, zero skips.
- Nearby actual store/domain/transport tests: 145/145, zero skips, including concurrent observers, offline recovery and workspace rebase durability.
- Normal `npm test`: 3406/3406, zero failures, cancelled cases or skips.

The existing browser permission journey is strengthened with a deterministic stale snapshot. It calls the same imported application store module through the isolated authenticated transport and checks every final sibling RPC retains the pending note. Subsequent real UI actions still check the failed permission, reload, recovery, shared and personal acknowledgement, and exactly one delivered note.

Browser controlled proof temporarily substituted only `src/data/localStore.mjs` from public 9e96, with an exact byte backup and finally restoration:

- Old source RED: Android-profile Chromium failed `a stale bootstrap must preserve the pending note in every final RPC payload`.
- Restored source GREEN: 1/1.
- Same fixed journey in Android Chromium, iPhone WebKit, iPad WebKit, iPhone large text and 200% reflow: 5/5, retries 0.
- Fixed raw source before and after control: SHA256 `6ba64437a5334646909ada622e4945c712ea489317beaf25db9e0b588b831c56`.
- Old canonical source bytes: SHA256 `72e942c4ca78a127903b2f441783ef172b7183e53a0551ee2dc18baacb147736`.

Root receipts remain outside Git in `outputs/pending-payload-*`, including the original public failure artifact, controlled RED trace/video/screenshot and exact restoration receipt. An intermediate edit failed with an assignment-to-const error and was corrected before the successful GREEN; that log is preserved. An initial browser invocation used a Windows path as a test regex and selected no tests; the valid selector run is separately recorded.

These are synthetic browser/transport tests and real application module tests. Current combined-source CI, independent-client sync and both Native gates must still be run after this fix is published. This evidence does not claim physical-device, store upgrade or production verification.
