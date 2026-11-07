# iOS QA status readiness: first committed capture

Base: 4acd8b3f3032007da299a2d053e042280625bd85. This changes isolated QA instrumentation, not application runtime or release packaging.

## Actual failure

QA run 38098916803, job 114350770936 stopped the default XCTest before typing. Artifact 11687098181 (91,658,555 bytes), SHA256 4b5c5595317b9ef886797b9eade0903e35c7e9206531b1a28569384ad0311f07, preserves the test log, simulator log, UIKit captures and XCUIScreen attachment.

The native diagnostic UILabel existed while the journey was still starting. App launch/automation returned around 43 seconds; the subsequent form wait used its existing 35-second deadline. Simulator accessibility observations reported starting at 00:46:56.858, home at 00:47:08.680, profile at 00:47:11.399, and keyboard-ready at 00:47:15.382. The failure screenshot/state was collected after the deadline and already showed the real UIKit keyboard and an amount point. Eight captures and zero journey errors are present; amount typing, save, relaunch and accessibility XL did not run. Thirty validator controls passed. The cause of the long initial prelude is not established, and this is not a startup performance acceptance.

## Corrected boundary

The status label receives the queried identifier and becomes accessible only after the first home screenshot acknowledgement. On relaunch, the first restored screenshot acknowledgement enables it instead. An error remains immediately accessible, including before the first capture. Bootstrap cannot consume the later native-form wait while claiming that native status is ready.

Both existing XCTest 35-second waits, later action waits, native taps, keyboard checks, save acknowledgement, geometry validator and tolerances remain unchanged. Readiness does not skip any of the eight preparation screens.

## Permanent regression evidence

The browser preflight executes the actual journey script and holds native App.getInfo and then the first screenshot ACK independently. A read-only status adapter must remain unavailable through both barriers, then expose the full eight-screen journey at keyboard-ready. A second test rejects bootstrap and requires the error to be visible immediately. The normal unit suite also verifies that successful restored captures release status and missing rendered expenses expose failure.

Replacing only journey.js with exact base 4acd8b3 produced RED in the initial status boundary. Finally-guarded restoration of the exact fixed bytes produced GREEN. Receipt: outputs/ios-readiness-red-green-receipt.json in the coordinating workspace. Base SHA256 523cfdc76e6e46905c5e28d871fd7dd0786c5ea5d6543d166a333c308d7b64ca; fixed SHA256 27749828b00df63843f5f564955ff785e024e34a3e5a8fe762d42eafab6d2909.

The two focused browser controls passed. All 40 nearby preflight/measurement cases passed across the five mobile profiles without retry. The normal JavaScript unit/integration suite passed 3424/3424, with no failed, cancelled or skipped tests; bootstrap/restore tests also passed separately.

These controls validate the script/status protocol using browser or VM adapters. They are not Swift compilation, UIKit acceptance or physical-device evidence. A fresh actual-SDK Native run on the final unified source remains required.
