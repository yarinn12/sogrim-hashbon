# Android host scheduler observation contract v2

This QA-only change is based on source `8f5a5ba66b27299698a43617eb153e79a19bad79`.
QA466 run38729651372 attempt1 remains failed under its original v1 contract.
Its artifacts and results are immutable; this proposal does not accept that run
retroactively, establish Native acceptance, or establish an ANR fix.

## Meaning and sole exception

The new summary and each sample identify version2,
`observed-live-owned-host-tasks-v2`, scope `observed-live-owned-host-tasks`.
The inventories are **non-atomic**. They do not prove coverage of every thread's
whole lifetime, tasks born and gone between endpoints, or renderer roles.

Every TID in the final inventory must also be in the initial inventory and have
its own verified PID/startTicks identity and all five real CPU/scheduler counters.
The collector still rereads its identity after counters and rechecks the emulator
owner. Monotonic counters are checked within each observed lifetime.

The only permitted endpoint difference is an initial TID whose **first stat read
in this sample** fails with `ENOENT` and which is absent from the final inventory.
No identity has been successfully read for that TID in this sample. Its retained
`unobserved-exit` event has `startTicks`, `identity`, and `counters` explicitly null.
Both inventories and the original initial stat error remain in the same sample.
The sample is neither skipped nor retried. Summary fields count these exits and
the samples containing them. The finalizer rejects old/mixed contract receipts
and absent or inconsistent exception accounting.

Exit after a successful identity read, any new TID in the final inventory,
initial ENOENT with final presence, EACCES/EIO/other errors, identity reuse,
missing/malformed/decreasing counters and caps remain failures. ZERO_WCHAN
continues to describe unavailable optional kernel wait-channel information;
it does not replace scheduler counters.

## Regression evidence and boundaries

`tests/fixtures/android-native-qa466-sample300.json` is the unchanged retained
sample300 (11:57:37.138 UTC), SHA256
`7f34db455a903289e7435e7ce397f68941c836d582852208ecca1285ae9d016f`.
An exact `.gitattributes` `-text` rule preserves its original bytes on Windows
and Linux; the regression's strict hash assertion is unchanged.
It comes from original artifact11970341161, ZIP124776582 bytes, SHA256
`9a1b5dbd70c468a4558fc8601453625b8aab022a0230f61562295de62ee4e09b`.
Owner PID3286/startTicks29104, initial189/final188 tasks and TID4622's first
stat ENOENT are replayed through the actual sampler using injected proc reads.
All188 measured task records are compared exactly with retained real records.
No runtime identity/counter is invented for4622. Synthetic mutations exercise
the other failure boundaries; these are local tests, not another CI/device run.

The identical regression first fails on 8f5 because that case is classified
incomplete, then passes on the proposed collector. Existing negative assertions
remain intact; only their positive summary fixtures adopt the new contract.
The normal suite includes the new tests. Local evidence records focused tests,
the complete normal suite, architecture and actionlint separately.

UI actions, ANR history/gates, ASG/renderer configuration, capture and action
budgets, sample interval, host/guest size caps, owned cleanup and guest writer
close rules are unchanged. No product code, workflow, store, signing, push,
CI dispatch, retry/rerun or automation action is included. Root and QA review
the frozen source and evidence before any activation.
