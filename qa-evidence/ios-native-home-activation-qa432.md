# QA432 iOS Native Home/activation failure and local QA-harness correction

Rejected application/QA source: `0c335a421a30e962433c23573edb162169d3663d`,
tree `f56bf487664907138880fe537bfa567593538bb0`.
QA432 Actions run `38124561294`; iOS Native job `114426337868` failed.
Retained artifact `11696504680` is 106,517,870 bytes, SHA-256
`b2c4d65f49eaf18526717c1bedddeac33ff99f752d3615d8437dbada2e6d6e36`.
The local ZIP size/hash matched the artifact metadata. Its package manifest names
the same commit/tree. The exact QA Swift blobs at that commit are
`ParityUITests.swift` `366ac1553b187947a5c6d74e6b37de4e3d40be43` and
`ParityBridge.swift` `16ae4c09231e8af7712929ccc38f60af96725d89`.

## Failure observed in the original simulator run

The normal-size XCTest reached real UIKit keyboard input and native taps, saved
the synthetic `QA iOS` expense (12,000 agorot), and received the final financial
write acknowledgement. Its 11 captures stop at `saved`; the saved record shows
three writes, an empty pending outbox and no application errors. There is no
`resumed` or `restored` capture. The test failed at generated
`app/ios/App/ParityProbeUITests.swift:44` after 101.639 seconds with
`Timed out: native background and foreground`. The last state was
`phase=saved`, `backgrounds=1`, `foregrounds=1`, `errors=[]`. The iOS
accessibility-size journey did not run. The failure screenshot shows SpringBoard
Home with the app icon, and subsequent AX reads report
`kAXErrorServerNotFound` for WebContent PID 17075.

At 08:31:14.349 UTC XCTest pressed Home. It requested `app.activate()` at
08:31:19.839. UIKit began deactivating the app at 08:31:20.558, WebKit
reported background at 08:31:21.663 and RunningBoard marked the app
`NotVisible` at 08:31:21.708. The original XCTest called `activate()`
immediately after `press(.home)` without checking `app.state`. These times
support a Home/activation ordering race, but the single artifact cannot prove
that this is the sole cause. The observer report had zero samples and an initial
`container-unavailable` diagnostic, so it is not independent stall evidence.

The QA bridge also checked `foregrounds>0` before requesting `resumed`; the
initial launch had already produced `foregrounds=1`. A status poll after Home
could therefore consume its one-shot request while still in the background.
That guard is a real code-level weakness, but the artifact does not show that
it caused this failure. The bridge sets its latch before an unchecked
`evaluateJavaScript` call; this remains a separate, unproven failure mode.

## Isolated local correction

Commit `919d3927a60720c9670137e87810620889eef667` has parent
`0c335a421a30e962433c23573edb162169d3663d` and tree
`0627bd5c3bbeae1487cad23be41cb609381879c6`; it was created locally
without a Git signature or push. It changes only the generated QA XCTest source,
QA bridge fixture and permanent timing control test. The same source tree was
subsequently integrated by the parent task as `76ee860`.

After the acknowledged save, XCTest records the previous native counters, starts
one 35-second lifecycle deadline, presses Home, waits for actual
`runningBackground` or `runningBackgroundSuspended`, then calls `activate()`
once. Before accepting `resumed`, it requires the app to be in
`runningForeground`, both lifecycle counters to exceed their pre-Home values,
and the phase to be `resumed`. Both lifecycle waits share that one deadline;
there is no retry or added time window. The relaunch/restoration wait remains
45 seconds. The bridge waits for a foreground callback newer than the latest
background callback and for `UIApplication` to be active before requesting the
resumed capture. This is QA harness code; application runtime code is unchanged.

## Regression evidence and limits

The permanent `tests/iosParityLifecycleOrder.test.mjs` reads the actual QA
Swift sources and applies their observed ordering, guards and deadlines to a
small delayed-lifecycle scheduler. It covers delayed Home completion, Home
never reaching background, stale foreground count, an app left in background,
a prior background event and a resume after the shared deadline. A separate
case covers the native bridge requesting capture only after a fresh active
callback. The model is a local source/timing control; it does **not** execute
Swift, XCTest, UIKit or WebKit.

- OLD RED: on the original XCTest blob, five of six timing cases failed; one
  passed. The bridge case failed separately on the original bridge blob because
  background polling consumed the capture request.
- GREEN: all seven timing cases passed after the correction. Two nearby iOS
  tests also passed: 9/9 focused tests, zero skips.
- Native validator controls: 38/38 passed with temporary files directed to the
  writable workspace. The first attempt failed only because the Windows sandbox
  denied writes to its default temporary directory.
- Full local `npm test` after the Swift correction: 3,509 passed, zero failed
  or skipped. An earlier sandboxed run failed on localhost `EACCES`; one
  escalated run had two unrelated Android cleanup timeouts; the following
  escalated run passed. A later full rerun after a small test-only assertion
  change was interrupted and its incomplete log is not acceptance evidence.
- No macOS/Xcode SDK is installed in this Windows workspace. The fixed commit
  has **not** been rerun through native iOS CI, so real-simulator GREEN and
  accessibility-size acceptance remain open. A fresh exact-source iOS job must
  confirm the complete normal and accessibility journeys, including `resumed`
  and `restored` captures, screenshot acknowledgements and the strict validator.

The original source's separate two-client sync job passed 91/91. Its five
browser mobile profiles passed 1,542 tests with 38 skips. Those were synthetic
CI profiles, not production devices or live push delivery; they do not override
the Native iOS failure or establish production latency. The Android Native job
failed in its diagnostic/owned-emulator cleanup step and is tracked separately.
