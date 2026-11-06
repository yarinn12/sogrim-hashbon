# One-shot Pipe compatibility, original QA496 APK

Local preparation for Root review only. **The first creation push of the exact
new branch starts this diagnostic. Do not push before Root approves a specific
final commit and receipts.** No Pipe emulator or cloud diagnostic has been run by
this preparation. The consumed d23/7d6 diagnostic branches are not changed.

This is one unconditional PIPE attempt. It has no ASG arm, no positive-baseline
condition, no A/B/A sequence and no causal comparison. A clean/non-reproducing
ASG run is not required or run first. Its purpose is to establish whether the
original application workload can execute under the explicitly selected Pipe
environment with all required capabilities and checks, or to record why it cannot.

Application source is 2d4a973a197a2228fcd134f01d6763f500fd63bb, tree
6c8c8afe3315d3f86f96c4805aae23894a7aa210. Original qa-tools-source.txt records
the PR merge d0c7bd1040993d15e382e48865e21c72ca8b3236; its whole tree equals
the application tree. Check both identities and every one of 2037 raw Git files
before and after preparation/workload. Reuse run 42274817530 / artifact 13534285250:
ZIP 129085539 bytes, SHA256
295824d624b928617b50bf7988bf258f7161cbdc30a78abc2ec266cfc1080f18;
APK SHA256 42234fe6dfba53c22c36be34eca3c6f28b3a38bc365827a93386ca17df5095cb;
single original public Debug signer
3da8a98ae4f748051a83ea0cce03adf20829fbc921b6dff9551ff7bfae4da8ae.
Verify all 284 public assets and 13 fonts. No build, re-sign, cap sync, version
change or Native diagnostic probe is permitted. The original bootstrap is synthetic;
there is no real login/push/database/Play-upgrade/release-performance evidence.

Use one standard Ubuntu 24.04 job, total 45-minute bound, first branch-creation push
only: exact repo/ref/after SHA, zero before-SHA, created=true, forced=false,
deleted=false, workflow run number 1 and attempt 1. The controller independently
checks the payload and its checkout SHA. There is no dispatch/call/update/rerun
entry, retry or renderer/SDK/transport fallback. Permissions are read-only
contents/actions. Vercel deployment is disabled for this branch. No paid runner
or new service is used; this is not a product publication workflow.

Keep Android 36.1 Play x86_64 image revision 4, emulator 37.2.13, original four SDK
metadata hashes and hardware schema 13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d.
Keep the original pixel 6, 1080x2400 / 420dpi, 4096 MiB, 2 cores, SwiftShader,
GLDirectMem/HasSharedSlotsHostMemoryAllocator and transport-buffer settings.
The required transport is Pipe. Verify real emulator log, actual guest readbacks,
renderer and capabilities before workload. Unsupported Pipe or missing capabilities
must fail; do not disable features to make it work. A fresh owned AVD has its own
name and paths; identical physical hardware or a historical full-AVD image is not
claimed.

The committed SDK ELF reference contains 127 actual Linux files from d23/A1
(run 42266716697 / artifact 13527881983). Pin its bytes, require the current inventory
and before/after hashes to match, and bind actual postboot exe/maps SDK ELF files
to it with PID/startTicks, inode and content-hash checks. Original 2d4 executable
hashes were not captured: matching its metadata is not historical binary proof.
Raw snapshots and non-ELF SDK data remain explicit; no lifetime module coverage
is claimed. Hashing, ownership guards and other measurement overhead are retained.

Only trace start/watch/finish uses the separately reviewed observer fix 4fcc1150.
Pin both modified QA file Git blobs and record control source separately from the
original workload tools. Invoke those observer scripts from the CONTROL checkout;
do not patch the original application checkout. The observer retains ESRCH task
departure as partial/unverified under the existing four-inventory identity rules.
Owner loss, live gaps, PID reuse, unrelated errno, corrupt journal and missing or
foreign stop remain failures. Lifetime/all-thread/renderer-role proof remains false.
This prospective fix does not complete the interrupted historical 2d4 capture or
fix/explain its application ANR. MainActivity/cache policy remains unchanged.

Run the original full network/launcher/IME/prelude, font negative control,
acceptance matrix including separate hold coldstarts, all 24 pages / 325 checks,
journey/actual IME and acknowledged persistence, geometry negative controls and
before/after health. Original script bytes and deadlines stay unchanged. The
controller deliberately runs every original workload stage once after a workload
exit failure instead of skipping later geometry/health checks. It retains every
exit/error/signal. Lost ownership or an invalid pre-workload environment stops
further commands and receives no compatibility credit. Always attempt trace
finish and full-history ANR diagnostics before guarded owned cleanup.

Compatibility requires the full 216 matrix checks, 24 pages / 325 checks, 8 journey
checks, font fault detection/exact restore, 4 geometry controls, both health gates,
zero target ANR history, exact source/SDK/loaded identity and complete integral
capture with actual owned stop. A late recovery cannot erase an earlier ANR.
All partial/failed outputs stay in the artifact. Complete capture means an integral
bounded observation window, not loss-free trace, whole lifetime/all-thread coverage,
a host renderer role or guest/host causal clock calibration. Real Trace Processor
loss/scheduling analysis is still required after execution.

`PIPE_COMPATIBILITY_OBSERVED` is separate from technical exit and any release
gate. It gives no causality, application exoneration or host-deadlock proof and
does not erase QA496's original Native failure. All outcomes keep
originalSourceGate=FAILED, nativeAcceptance=false and releaseAcceptance=false.
No keys, store, current-source CI acceptance or public deployment is authorized.

Local controls are `node --test tests/androidPipeCompatibility.test.mjs`, including
14 Python archive/source/SDK controls in one Node wrapper, plus the reviewed
observer regressions. Synthetic Pipe log data tests parsing only. Actual Linux
SDK boot, real Pipe selection/capabilities and full compatibility remain untested
until the reviewed first push is explicitly approved by Root.
