# Android host observations: terminal survivors v4

Historical v4 contract. The current diagnostic tool implementation is documented
in [android-observed-cohort-v5.md](android-observed-cohort-v5.md). Historical v4
captures and failures are not migrated or retroactively accepted.

`observed-terminal-survivors-v4` (`coverageVersion: 4`, scope
`observed-terminal-survivors`) requires verified observations for every TID in
the fourth, terminal inventory. An ENOENT while reading a task that is absent
from that inventory is an observed departure. It does not prove an atomic
snapshot, a complete lifetime, final counters at exit, or a renderer role.
`atomic`, `lifetimeCoverageProven`, and `rendererRoleProven` remain exactly false.

The bounded collection order is initial inventory/counter pass, discovery
inventory/one newborn counter pass, afterFinal inventory/identity-only closing
pass, terminal inventory, then owner PID/start revalidation. There are no counter
retries. Each terminal survivor needs its own matching identity before and after
the five actual counters, plus its matching closing identity. A live gap, late
unmeasured birth, permission or I/O error, malformed read, identity reuse,
ownership loss, counter regression or cap still rejects the sample/capture.
An ENOENT followed by a later presence/read is unresolved, even if the task is
absent at terminal.

Every frame retains original full and partial counter records, all actual
identity observations, raw malformed reads, read errors and lifecycle records.
Scheduler values and wchan actually read before a failed identity-after remain
present with `countersVerified: false`. The identity-after array contains only
TID/PID/start, and quality groups contain TID references rather than copies of
counter records:

- `survivorsVerified`: records with five verified counters and matching identities
  in the reads actually performed, for numeric TIDs present in the terminal
  inventory. The closing identity read precedes that inventory. This is not
  proof that the same lifetime continued until the inventory or afterwards;
  reuse entirely inside the unobserved interval cannot be excluded. Observed
  identity changes or disappearance/reappearance still fail. Adding another
  finite scan would move, rather than eliminate, that interval.
- `departedVerified`: terminal-absent tasks with five verified counters; no
  closing identity is invented when its read failed or was never attempted.
- `departedPartial`: terminal-absent tasks with a known identity and only
  partial/unverified observations. These cannot satisfy worker coverage.
- `unobservedExits`: terminal-absent tasks whose initial stat returned ENOENT;
  identity/start/counters remain unknown.
- `unresolvedGaps`: errors or contradictions that prevent acceptance; must be
  empty. Rejected frames and their classifications remain available.

The consumer independently checks classification, lifecycle, read phases,
identities, required counters and accounting. A persistent history rejects a
departed known identity reappearing and conservatively rejects an unknown
departed TID returning. Different observed start ticks remain separate known
lifetimes. Actual partial counters are checked for decreases against earlier
values. Only accepted observations update history. Finalization requires at
least two complete samples and actual non-main terminal survivors; departed
rows, even fully measured ones, cannot replace that survivor requirement.

## Regression evidence and fixture corrections

QA468/run38744710465, source068c59c, sample552 failed v3 because task5449 had
real counters but its closing identity read returned ENOENT. The original raw
fixture is retained byte-for-byte (92,049 bytes; SHA256
`a75e3e3566e997ed28a102352ee0e424166dfe8e896078e8ba11c1313cf1572e`).
The historical run remains failed: it never collected a fourth inventory.

The prospective regression reconstructs the original reads and introduces only
a **synthetic fourth inventory excluding5449**. All239 counter rows and all238
closing identity rows compare exactly with the original. The unchanged test
fails on068/v3 and passes on v4. No identity or final counter is fabricated.
The summary control uses a subsequent frame where5449 stays absent. An initial
test draft incorrectly repeated the departure frame; that is a reappearance
and v4 correctly rejects it. Its fixture was corrected before freezing the
identical OLD/FINAL test. Separate negative tests keep that reappearance fatal.

Legacy test changes are explicit contract updates, not product-failure
reclassification: v3 assumed any known exit made coverage incomplete. The
existing natural exit during read now asserts a retained partial departure;
fully measured original/newborn departures now assert verified departures when
both closing and terminal inventories omit them. A reuse test now requires
retention of actual unverified scheduler values rather than their deletion.
The QA466 positive history control similarly uses an absent followup frame
instead of repeating an unknown departure; it records one unknown exit, not two.
Existing forged lifecycle, permissions, live-gap, reuse, late birth, decreasing
counter, ownership, cap and finalization assertions remain failures. Positive
summary fixtures now supply all required v4 counts, so negatives do not pass
merely because their fixtures omit the new schema.

Synthetic lifecycle tests cover early/mid/late ENOENT departures and the same
errors with terminal presence, partial value retention, newborns, unmeasured
births, EACCES/EIO, malformed reads, identity reuse, disappearance/reappearance,
cross-sample history, counters and worker accounting. They run in the complete
normal inventory. Local tests do not establish new emulator/device coverage.

## Fixed serialization budget

A static model of the unchanged QA468 journal prices the new terminal inventory,
identity-only rows and TID quality groups. Original:38,936,846 bytes/552 samples/
99,941 counter rows. Model:44,561,534 bytes (+5,624,688, +14.45%), 66.40% of the
unchanged67,108,864-byte cap, with22,547,330 bytes of headroom. The model retains
5449 in its hypothetical terminal list and therefore still has one incomplete
frame. It does not retroactively supply a terminal observation or identity
proof to the historical run, write a replacement journal, measure runtime
overhead or guarantee that a future population fits. The original journal hash
is rechecked after the calculation. The executable model and receipt are local
handoff evidence, outside the source diff.

The host64MiB and guest512MiB caps,1s interval,20min duration bound, cleanup,
writer-close protocol, workflow, UI, ANR assertions and existing deadlines are
unchanged. No new CI capture, signing, store or production action is part of
this source change.
