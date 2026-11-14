# Android observed-live host coverage v3

Base source: d92a6184a24fe693b8da2ebc13c5accef7f38c12. QA-only proposal;
no workflow, UI, ANR, ASG/renderer, deadline, retry or storage-cap change.

The versioned sample/summary contract becomes3,
`observed-live-owned-host-tasks-v3`. Scope remains observed live owned host tasks;
inventories are non-atomic, lifetime coverage is unproven and rendererRoleProven
must be exactly false at both consumers.

Each sample retains `before`, `afterDiscovery` and `afterFinal`. Initial tasks
receive one original counter pass. Only TIDs newly listed by afterDiscovery get
one additional counter pass: initial identity/CPU, schedstat, optional wchan and
identity recheck. Earlier errors are preserved; no previous task is retried.
After afterFinal, every final survivor gets a PID/startTicks-only stat read,
matched against its counter identity. This includes original tasks, not only
newborns. Closing reads never resample or replace any of the five counters.
Raw closing identities and errors remain in the sample.

A task appearing only in afterFinal has no real counter record and fails. Exit
after an observed identity, any newborn read failure/exit, final identity ENOENT,
EACCES/EIO, PID/startTicks reuse, missing/malformed/decreasing counters and caps
still fail. Initial pre-identity ENOENT can retain the previous explicit unknown
exit exception only when absent at both later endpoints. ZERO_WCHAN remains
optional information, never a substitute for counters.

The recorder independently validates all three inventories, measured tasks,
closing identities and lifecycle evidence. Summary counts include newborn tasks
and verified final identities; final identities must equal complete samples plus
measured non-main tasks. The existing finalizer requires the new contract and
accounting. Interval1000ms, duration1200000ms, host67108864B and guest536870912B
limits are unchanged. No record is skipped or truncated to obtain acceptance.

The raw QA467 sample284 remains an immutable failed v2 record. Fixture
`android-native-qa467-sample284.json`, SHA256
95eff2eef0ee989c92dd9fb9d2c90afbcad2d6eee63b1145abf61edcc6390a1c,
is copied byte-for-byte from original artifact11973609729 (ZIP SHA256
471cb364c1725f4e61e43825166684fcc9e7d7d2230e68a75f49efa49554321c).
An explicit -text attribute preserves its bytes. It contains179 actual task
counter records and NO identity/counters for4548. The regression replays those179
unchanged and separately supplies clearly labeled synthetic-only4548 data.
Those synthetic values are not evidence from QA467 and do not repair that run.
The identical regression fails on v2 and passes on v3. Other controls cover
closing reuse/errors for old and new tasks, new final TIDs and counter failures.

Existing positive fixtures adopt the versioned schema and added identity reads.
The original closing-inventory newborn negative still fails with its assertions
intact: its fixture now introduces that unmeasured task at the third (closing)
endpoint. The existing missing-real-data new-TID control also remains a failure.
No negative expectation is changed to acceptance.

Local/synthetic tests do not establish new Native CI acceptance or an ANR fix.
QA467 remains failed; no counter/identity is guessed or added to its artifact.
