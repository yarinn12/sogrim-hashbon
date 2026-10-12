# QA433 iOS input diagnostic

This is instrumentation for the unsigned simulator QA build only. It does not
change the application's touch handlers, XCTest taps, deadlines, or acceptance
assertions. `input-trace.js` arms at `keyboard-ready`, keeps at most 48 input
events, and records only event type, trust, time, coordinates, pointer type,
phase, and allowlisted element tags/actions. It never records field values,
text, names, IDs, or account data. The latest 12 events and drop/error counts
appear in the native status label. Each event also appears as `webInput` in
`native-parity-status-<session>.log`, which the existing failure artifact saves.
The native status additionally samples UIKit `hitTest` at the mapped field or
button point. That read does not synthesize a touch or change gesture routing.
It identifies the geometric target at the status sample time; it does not
prove that XCTest injected a touch or that UIKit delivered one.

## Reading a failed native run

Match the XCTest `Tap ... -> (x, y)` line to the nearest status publication and
its `nativeHitTest`, then to `webInput` rows by `epochMs` and sequence. Compare
the system screenshot and the last phase:

- `insideWebView: false` at the mapped point suggests a native overlay or a
  coordinate mismatch at sampling time.
- UIKit reports the touch, but no `webInput` reaches JavaScript: investigate
  delivery into WKWebView. A missing JS row alone cannot prove where the
  event stopped; inspect the simulator's UIKit event log too.
- Trusted down/up reaches the button but no trusted click follows: investigate
  browser gesture cancellation or an obscured hit target.
- A trusted click reaches another action: investigate the target or mapping.
- A trusted click reaches `expense-step-next` but the step does not advance:
  investigate the application handler and its validation state.
- `dropped` or `bridgeErrors` above zero makes the event record incomplete;
  missing rows then cannot support a conclusion that a touch never arrived.

The previous QA433 failure used source `1ec17c78255ee784d13880777853eb7f4421ca7e`
and tree `1ae8def17f153508c33fc9b73aef7ded06a3d58b`. It stopped after
entering 120 on the amount step; its screenshot still showed the amount step.
Its `namePoint` was null, so that run did not verify save, background/foreground,
or relaunch. This diagnostic change does not resolve that failure.

## Reproduction when no local iOS SDK is available

On a Mac with Xcode 26.6 and an available iPhone 15 or 16 iOS simulator, run the
existing `ios-parity-qa.yml` workflow once with the exact application SHA and
this QA fixture revision. Keep the original XCTest tap sequence and record the
workflow run ID. Preserve the unsigned simulator artifact, XCTest log, status
log, system screenshots, and simulator log before any proposed fix. In a clean
synthetic account, the same manual journey is: open the seeded event, add an
expense, focus the total field, type `120`, tap “המשך לשם ההוצאה”, and verify
the name field appears without another tap. Repeat at the real OS accessibility
size. Record a screen video and device log if using a physical test device.
Do not use production data.

`e2e-parity/ios-input-trace.spec.mjs` exercises the JavaScript recorder with
real pointer and touchscreen input, an untrusted synthetic click, the 48-event
bound, and content redaction in Chromium, Firefox, and WebKit. Those browser
controls do not execute Swift, UIKit, XCTest, or an iOS simulator; only a new
native run can validate the native `hitTest` sample and end-to-end delivery.
