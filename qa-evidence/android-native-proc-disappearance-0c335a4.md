# Android close-watch proc disappearance regression

Parent: `0c335a421a30e962433c23573edb162169d3663d`.
Parent tree: `f56bf487664907138880fe537bfa567593538bb0`.
Scope: isolated QA helper, its behavioral tests, and this evidence note.
No product, iOS, workflow, SDK, store, lockfile, threshold or trace-resource change.

## Observed failure and change

QA432 (run `38124561294`, Android job `114426337873`) passed its scenario
gates, then the actual close helper returned 7 after `WATCH_READY` and
`CLOSE_WRITE`. Its stderr included `sed: /proc/8812/stat: No such file or
directory` and `Owned close-watch cleanup unconfirmed`; no `WATCH_CLEANED`
was returned. The source matches the generated script retained from the job.
This establishes the observed failure, not the precise SDK race cause:
the watcher's parent, start ticks and argv at the failing observation were
not separately retained.

The helper now rechecks proc absence after failed identity/command reads and
reaps only a disappeared or confirmed owned zombie child. It also rechecks
parent/start ticks after the command read and before TERM/KILL. A surviving
read error remains an error, while an expected disappearance can complete
cleanup without a stale signal. The full Toybox argv, trace-path and ownership
guards remain required. Exit 5/6, cleanup error 7, `WATCH_CLEANED`, 20 bounded
TERM polls, 20 bounded KILL polls, 50 ms guest polls, 15 s guest limit and
20 s ADB limit remain unchanged. Proc observations are not globally atomic;
this does not introduce a pidfd guarantee.

## Deterministic behavioral coverage

The final 42 tests execute the generated guest shell under Git Bash with
synthetic proc/SDK observations and a real owned child holding stderr.
New cases select 15 disappearance boundaries, reject three surviving
read/malformed errors, reject four identity changes during command reads,
reject reused/foreign zombie identities, exercise a live helper descendant,
and verify ready-PID and atomic stat publication. Original 15 cases retain
full/split Toybox argv, TERM-to-KILL, foreign argv/path/parent/start ticks,
missing writer-close ACK, inode mismatch and post-TERM ownership changes.

The fixture publishes complete stat snapshots by same-directory rename and
waits for both ready PID and readable stat before the initial read. A
controlled partial initial stat is preserved as a regression scenario.
Only helper utility descendants have isolated stdout/stderr; the owned
watcher still holds the actual transport pipe. The local 15 s harness
deadline and 500 ms post-parent-exit pipe grace were not increased.

An earlier unified local log had `parts[19]: unbound variable` in `intact`,
consistent with the old fixture reading an incompletely published stat.
The controlled regression now verifies complete publication and readiness.
Its second `intact-ignore-term` timeout remains unproved: the old log did not
retain signal receipts, mock-stat/child state, shell phase, or parent-exit
versus pipe-EOF history. The separate controlled grandchild experiment
demonstrates how inherited pipes can delay EOF, but does not identify that
second timeout's cause or any SDK timeout cause. New failure context retains
the local phase, signal receipts, poll/identity counters and child readiness.

## Verification on exact bytes

Final helper SHA-256:
`5a73bbbbbd4874ee2f182d242600c01285ec1f20f8d199a12c9ad7dd672f30e2`.
Final test SHA-256:
`8f6a45d83962723de5736398f80f70f8bccac0252ef9f97deb9df0ceb3e9e970`.
Actual baseline helper SHA-256:
`0073a2954f2668f182340423c134a17bf313f0bb92ac27c4002b9f66c044cc8f`.
The same final test bytes ran against old and corrected helper bytes.
All input hashes were unchanged during execution.

| Run | Result | Node test duration |
| --- | --- | --- |
| Corrected focused tests | 42/42 pass, exit 0 | 88,233.3392 ms |
| Exact parent with identical final tests | 24 pass / 18 behavioral assertion failures, exit 1 | 85,697.7103 ms |
| Nearby trace/CLI/ANR/emulator helper tests | 60/60 pass, exit 0 | 2,653.6542 ms |
| Normal repository runner | 3,529/3,529 pass, exit 0 | 103,241.1445 ms |

Commands: `node --test tests/androidNativeCloseWatchCleanup.test.mjs`;
`node --test tests/androidNativeTraceDiagnostics.test.mjs tests/androidNativeTraceCli.test.mjs tests/androidNativeAnrDiagnostics.test.mjs tests/androidNativeEmulatorHealth.test.mjs`;
`node scripts/run-tests.mjs`. The OLD run uses the retained parent-source
checkout and the identical final test. Receipts record exact commands,
working directories, inputs, logs and timestamps.

An earlier normal run failed from unavailable dependencies, not the 42-test
regression. Its evidence is retained. The final successful run used a
junction to an existing installed dependency tree; no package install or
lockfile change was made. The normal suite must also be run on the main
coordinator's combined Android/iOS source before publishing that source.

Logs and portable receipts are retained in workspace
`outputs/android-native-0c335a4-proc-disappearance-fix-20261011/` as
`focused-final`, `old-final`, `nearby-final`, and `normal-final` logs/receipts.
Supplementary source mutants and fixture-only controls are recorded there
separately; this note does not preclaim their completion.

No SDK rerun or real-device check was performed. Native capture acceptance,
trace completeness, historical ANR causes, QA431's timeout cause and the
second local timeout cause remain open. The historical Google Play release
4.57 (187) predates this diagnostic fix.
