# iOS home wait: observer-only diagnostic comparison (draft)

This is a reviewable run design, not an activated workflow. Do not dispatch or
publish it until the diagnostic source, exact build, and runner are reviewed.
The existing 30-second `home` wait, 100 ms poll, 35-second native status wait,
13 capture phases, screenshot ACK, and failure status stay unchanged.

## Pinned inputs

- Application source: `8f6f47368cc36c27fe5392e2a0d67a52d54985b5`;
  tree: `869668e96b2a6ab5282bf864fcafcf060bafe3d8`.
- Use one unsigned `App.app` and one `xctestrun` built from that source plus
  the reviewed QA-only home-wait diagnostics. Record both SHA-256 digests.
- Pin Xcode 26.6, iOS Simulator 26.5, device profile, synthetic fixture,
  isolated network policy, and test selection. No product file or fixture data
  changes between arms.
- Prepare one build before either measured arm. Each arm gets a fresh erased
  simulator, the same `boot`/`bootstatus` sequence, the same install, and
  `test-without-building`. Do not run builds or other tests during an arm.

## Single variable and evidence

Run the current `native_stall_monitor.py` only in the **observer-on** arm,
starting at the same point immediately before `test-without-building` where
the current workflow starts it. In the **observer-off** arm, start no monitor
process and issue no replacement `simctl` or `sample` probes during the test.
Keep passive in-app startup/status logging in both arms. Do not infer success
from the monitor's own status.

For each arm retain source/tree, build hashes, simulator identity and runtime,
boot/install/test start times, exact observer state, `home-wait-start` and
`home-wait-ready` or `home-wait-timeout` records, WKWebView/GPU process events,
native parity status, test result, and the original capture/ACK evidence. The
home records contain only allowlisted state, geometry and mark timings; they
contain no user text, storage values, full URLs or request payloads.

## Readout

First compare the home element's presence, visibility, probe count and timing
at the unchanged deadline. If the observer-on arm alone fails, repeat the
pair in reverse order on fresh erased simulators before attributing a cause to
monitor overhead. If both arms fail, preserve the observer setting and test
build/boot ordering as a separate experiment; do not vary that order in this
pair. A late `native-styles-ready` event alone cannot identify the cause of a
`home` timeout. A rendered home with no timely poll points to scheduling; a
present but zero-sized/hidden home points to layout; an absent home points to
startup or fixture readiness.
