# Frozen 7d6 graphics transport diagnostic

Review-only control branch. **Pushing this exact branch starts the diagnostic.**
Do not push until Root reviews the final diff and receipts. There is no manual
default-branch registration, release acceptance, signing, store or database path.

The first push of `codex/android-transport-diagnostic-7d6-20261106` can run once,
attempt1/run-number1, in this repository on the existing standard Ubuntu24.04
runner. The original45-minute job bound stays unchanged for the whole experiment.
It has read-only Actions/contents permissions and this branch's Vercel deployment
is disabled. No push, workflow run or new service cost occurred while preparing it.

The application is7d6e13f5/tree06410366. Original QA tools were actually the PR
merge17c28d3f, whose entire tree is byte-identical to7d6. The original tools-source
file and job log establish that identity. Both commits are pinned separately.
The original artifact13501922018/ZIP2ad57bb8 and APK1f874e10 are reused without
building or re-signing. Every public asset/font, the Debug signer a548cfb5, exact
SDK files, source tree and2030 raw tracked files must match before boot.

The only treatment is `hw.gltransport=asg` versus `pipe`. The SDK schema hash,
actual boot/config/guest readbacks, SwiftShader selection, DMA capabilities and
buffer defaults must all agree. GLDirectMem remains enabled. If independently
selecting pipe is unsupported or changes another setting/capability, fail closed.
No alternate renderer, SDK fallback or product Java/acceleration change exists.

Run A1/ASG, B1/Pipe, A2/ASG once each, sequentially on the same runner with fresh
owned AVDs. The shared isolated ADB server is created once only after the original
unused-port guard; no existing server is killed. Each AVD receives the same
one initial APK install, complete original font-regression prelude, six-case
matrix including holds,24page samples and eight IME/write/relaunch checks. The
original conditional geometry/after-health behavior remains. A1 must reproduce
the150%-portrait cold-Home focus ANR with the original graphics stack; otherwise
stop before B1 as inconclusive. There is no retry-until-pass.

All original QA scripts and app files remain unchanged. A host-side Node preload
audits ADB subprocess calls before/after delegation using actual PID/startTicks,
the full emulator command, exact SDK binary and serial. It preserves the original
command options, exit, signal and binary stdout. It records measured guard timing
separately from command duration. Both arms receive identical instrumentation;
if that instrumentation prevents baseline reproduction, the result is inconclusive.
This overhead is not claimed zero. Trace/host capture retains its existing limits:
no invented renderer role, host waker, lifetime completeness or loss-free trace.

Always finish traces and full-history ANR diagnostics/bugreports before cleanup.
Only the captured logcat child and owned emulator can be stopped, with PID/start
and command checks; ambiguous ownership blocks commands and the next arm. All
exits, actual commands, resources, logs, traces and artifact hashes are retained.
An ANR remains failure even when subsequent checks pass. Failed conditional steps
are recorded, not fabricated as passes. Missing/invalid evidence is invalid.

`diagnostic-result.json` separates `diagnosticOutcome` from `technicalExitCode`.
A clean non-reproducing A1 may be technical exit0 and scientifically
`INCONCLUSIVE_NO_BASELINE`; it always has `nativeAcceptance=false`,
`releaseAcceptance=false`, `originalSourceGate=FAILED`. Genuine ANRs or invalid
arms keep technical exit nonzero, including a transport association. A1/A2 ANRs
with clean B1 support transport sensitivity only; they do not prove host deadlock
or exonerate application source. Raw trace loss/clock/scheduling analysis remains
required after execution. Current-source CI/release receives no credit.

Local verification: `node --test tests/androidTransportDiagnostic.test.mjs`
includes Python archive/APK/SDK/source negative controls. The normal suite also
enrolls this file automatically. Real SDK boot/pipe compatibility and Native
reproduction remain unexecuted until Root approves publication.
