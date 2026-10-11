# iOS native parity startup observer: QA430

QA430 source `31b2a849d68a9a98f6aad4b70325f29bff81bc81` (tree
`b466f3f42182a3f37a062de026e8649bb28762f2`) failed the default native
XCTest while waiting 35 seconds for `native-parity-state`. The status journal
continued polling: `viewDidAppear` was recorded at 06:12:42.426 UTC, and the
first ready `home` status was published at 06:13:27.158, about 44.7 seconds
later. The 35-second XCTest wait had already expired. The journal also included
`decoded` rows with `phase=missing` before `starting`; neither had reached a
profile capture. The old observer returned `before-profile` throughout this
startup period, so it could not sample the verified app process before the
failure. The later `gap` yielded no sample because container and PID probes
were unavailable or ambiguous. Its `app-pid-not-unique` error did not distinguish
zero matches from multiple matches.

The isolated QA observer change built on `2b45ad17b73607f8048a3d958a45b23616aee19c`
adds a startup diagnostic candidate after 20 seconds from the current session's
`viewDidAppear`, when a decoded status remains `nativeStatusReady=false` in
`missing` or `starting`. Twenty seconds is an observation threshold below the
existing 35-second XCTest wait, and above the previous successful QA429 normal
readiness interval of 16.1 seconds. It does not change acceptance or wait
deadlines. Ready, ended, stale, foreign-source and ambiguous sessions are
rejected. The existing UDID, manifest source/tree, app/data container,
session, executable path, unique PID, UID, process start time and immediate
pre-sample recheck are retained. Sampling remains limited to two attempts per
phase, 64 MiB output, 600 seconds observer wall time and 8-second command
timeouts. The report now records bounded container state and PID candidate
count, parser failures, command length and expected executable path digest.
It does not infer a process from simulator logs or loosen exact path matching.

The existing `.github/workflows/ios-parity-qa.yml` runs the monitor control
suite before the native build and starts the observer before `xcodebuild`
`test-without-building`; it stops the observer after the native run. No
workflow gate, product code, 35-second XCTest assertion or retry policy changed.

Behavioral controls using synthetic journals reproduce the old
`before-profile` result for both `starting` and `missing`, then pass with the
observer change. A separate control distinguishes zero from multiple matching
PIDs; rejected candidates never reach sampling. The final local run passed 21
monitor controls, 38 adjacent validator controls and 3,481 normal JavaScript
unit/integration tests. The handoff receipt stores the exact patch, RED/GREEN
logs and byte hashes. No Mac simulator or physical iOS device has run this
observer change. The app startup delay and its root cause remain unresolved;
this change only improves diagnostics for the next native run.
