# Frozen D767 graphics transport diagnostic

Review-only local implementation. **Pushing this exact new branch creates the
one-use diagnostic run.** Do not push until Root reviews a specific final commit
and its receipts. No experiment, emulator, SDK boot, upload or push was performed
while preparing this change.

The only trigger is the first creation push of
`codex/android-transport-diagnostic-d767-20261106` in this repository, with
created=true, deleted=false, forced=false, zero before-SHA, exact after/ref/repo,
workflow run number 1 and attempt 1. The controller independently validates the
event payload before boot. There is no workflow_dispatch/call or rerun fallback.
The whole job retains the original 45-minute bound and standard Ubuntu 24.04
runner. Its scope is the same job/runner VM across arms; exclusive physical
hardware is not established. Permissions remain read-only Actions/contents and
this branch's Vercel deployment is disabled. No new service or paid runner is used.

The application is `d7675a31fffa93699a1de65c9f786ab1ff619e30`, tree
`ce1ba6f3413f65e42612d82084dc40573b789486`. The original artifact's
qa-tools-source.txt actually records the PR merge
`1bc682b1d7b80e18d2b7701889eedf63832254e3`; the Git commit API proves that its
entire tree equals the application tree. Those commits are pinned separately.
The consumed 7d6 control branch at 8f553154 is not edited.

Reuse original run 42248375192 / artifact 13520906858 without rebuilding or signing:
ZIP 123,643,526 bytes / SHA256 87fac18782caa016a828c84e90fb4f4d9ecd4c61c793684130d322d90ef1743e,
APK SHA256 06d986835539c851041c7aab1752a2abf0749fdf79e112a38034851951e597cf,
single Debug signer 1439eb44eee35946f4199a79d02946e5de18de64196e0829c5942d3bae69c91b.
All 284 public assets, 13 fonts, source/tree, original tools and 2033 raw source
files must match before boot. The fixture bootstrap remains synthetic and gives
no real login/database/push/upgrade/release-performance evidence.

The original four SDK metadata/config hashes, declared emulator 37.2.13, Android
36.1 Play image revision 4 and transport schema remain pinned. In addition, before
and after each arm the controller fingerprints the SDK emulator launcher, QEMU
executable and regular ELF objects throughout the emulator SDK tree. Paths must resolve
inside the SDK emulator root; required executables/libraries cannot be missing.
Identity and byte hashes must equal A1 at every boundary. Timing/bytes hashed are
retained. This adds read/hash overhead equally to each arm and is not claimed
free. These are new between-arm hashes; historical original executable hashes
were not captured. This bounded binary coverage is not a hash of the whole SDK,
all host libraries or the physical runner. Unsupported/missing identity is invalid,
not permission to silently continue with another SDK or renderer.

After boot and before the original workload, owned PID/startTicks checks bracket
reads of /proc/PID/exe and maps. Raw snapshots are retained before coverage checks.
Every observed SDK executable/ELF mapping must resolve inside the emulator SDK,
have the same mapped inode as the file hashed, and match both the preboot inventory
and A1 byte hashes. Missing maps/exe, redirected paths or missing coverage invalidate
the arm. System modules outside the SDK are not added to this comparison.
Non-executable, non-ELF SDK mappings outside emulator/ (such as guest image data)
are retained separately with binaryIdentityCoverage=false, without requiring
membership in the emulator ELF inventory. SDK ELF or executable mappings outside
emulator/ remain invalid; emulator paths redirected outside that root are rejected.
These are observed postboot mappings, not a claim of lifetime module coverage or
historical binary identity.

Run A1/ASG, B1/Pipe, A2/ASG once each, sequentially on the same job/runner VM,
with fresh owned AVDs, memory 4096 MiB, 2 cores and the same SwiftShader selection,
DMA features, buffers and original settings. Only hw.gltransport changes.
Each arm retains the complete original prelude/font negative controls, full
matrix including holds, pages and journey. Original conditional geometry and
after-health behavior remains; a failed acceptance step's conditional omissions
are explicitly recorded, never presented as passes. There is no retry-until-pass,
alternate SDK, rebuild, renderer fallback or product acceleration change.

A1 must reproduce the first D767 pages 150% / portrait cold startup failure after
the complete matrix and two 100% page profiles, before any requested rotation.
The main application process must be launch ordinal 16. Exact process-name parsing
ignores WebView hosting-package matches and duplicate history. The target am_anr
time must follow that launch and the previous page profile, precede its ANR-focus
observations, and be inside the actual pages stage. Its same-PID, contemporaneous
ANR process block must contain the main DrawFrameTask and RenderThread drawGl
chain, plus the sampled AddressSpaceStream path for ASG. Graphics evidence from
another PID/time cannot supply a missing stack. No unmeasured Home state is
invented, and the old matrix-only classifier is not used.

No matching positive A1 means stop before B1/A2 as INCONCLUSIVE_NO_BASELINE or
INCONCLUSIVE_DIFFERENT_FAILURE. Missing ownership, source, trace, SDK identity or
required workload evidence is invalid. After positive A1 run exactly B1 then A2;
an invalid arm stops progression. Only positive A1, completely clean B1 and a
matching positive A2 rechallenge support TRANSPORT_SENSITIVITY_OBSERVED in this
fixture. Clean B1 requires 216 matrix checks, 24 pages samples / 325 checks and 8
journey checks, with no exceptions, ANR or command failure. A2 without reproduction
is inconclusive. A matching graphics-focus failure in Pipe with matching A2
weakens an exclusive-ASG explanation; it does not prove absence of transport risk.

The original scripts/timeouts stay unchanged. The identical host-side preload
audits owned ADB subprocess calls using actual PID/startTicks, full command and
serial while retaining exit/signal/options/binary stdout. Guard time is measured
separately; append and other overhead are not claimed zero. Always finish trace
and full-history ANR/bugreport capture before guarded cleanup. Only the recorded
logcat and emulator may be stopped. Ambiguous ownership blocks further commands.

Preserve every original failure, command, resource snapshot, artifact hash and
continuous history. Complete capture is not proof of loss-free trace, complete
thread/lifetime coverage, a host renderer role or calibrated guest/host causal
timing. Post-run Trace Processor loss/scheduling analysis is still required.

`diagnosticOutcome` is separate from `technicalExitCode`. Clean non-reproducing
A1 may exit 0 technically but remains INCONCLUSIVE_NO_BASELINE. Genuine ANRs and
invalid arms keep nonzero status even with a transport association. All outcomes
retain nativeAcceptance=false, releaseAcceptance=false, originalSourceGate=FAILED,
hostDeadlockProven=false and applicationExonerated=false. Diagnostic jobs provide
no credit to the four current-source release lanes or store gates.

Local controls: `node --test tests/androidTransportDiagnostic.test.mjs`, including
Python archive/APK/SDK/raw-source and binary-fingerprint controls. Tests are in the
normal suite. Actual Linux SDK compatibility, boot, Pipe behavior and reproduction
remain unexecuted until Root approves publication of the reviewed exact commit.
