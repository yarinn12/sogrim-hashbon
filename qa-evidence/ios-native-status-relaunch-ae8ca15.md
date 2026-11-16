# Native XCTest status polling during real relaunch

Rejected source: `ae8ca15a1026285e5b166ba13d4f1c94e44df1bf`.
Source tree: `e2ea0da6022db4506cc5b973a779eefdade061cf`.
QA run: 38102265901; iOS Native job: 114360641875.
Artifact: 11688128263, 105730660 bytes, SHA256
`4176f9d53f0ffd812f3b975d6a4f511dc7c99c6d62094dd345d2f56ea9856c22`.
The original failed artifact, logs, XCResult and screenshots remain preserved
outside the repository. It is not accepted by retrying or copying a prior pass.

## Actual failure boundary

The original permanent Native journey reached real UIKit amount/name input,
acknowledged save and background/foreground resume. It saved system screenshots
for keyboard-amount, keyboard-name and resumed. After terminate/launch at test
t=97.24s, `state()` queried `status.label` at t=106.26s while the status identifier
was still intentionally unavailable. XCTest retried resolving the absent element,
then failed at ParityProbeUITests.swift line 11 with "No matches found" at
t=110.45s. The test failed after 113.537 seconds, before its existing 45-second
restored-phase wait could finish.

The retained default-size Native JSON has all 13 capture records, including the
later restored record with a rendered QA iOS expense, total 12000 and empty
pending outbox. That does not turn the failed XCTest into a pass. Accessibility
XL did not run, and the final strict two-mode validator did not accept this source.
The separate 30 validator mutation controls passed.

## Change and permanent regression

`state()` first checks actual `XCUIElement.exists`; absence returns an empty,
unready observation. The existing predicate still requires phase `restored`,
then the existing assertion requires `restored == true`. Missing readiness can
never satisfy either condition. Failure reporting uses the same safe observation,
so a genuinely absent identifier still fails at the original deadline and retains
the system screenshot rather than failing while formatting the diagnostic.

The initial 35-second existence wait, 35-second form waits, 45-second save/relaunch
waits, real native taps/typing, final payload/ACK and geometry validator are
unchanged. This changes QA polling only, not application runtime.

The permanent real relaunch XCTest is the regression: the old reader is RED in
the digest-verified SDK artifact above. A fresh exact-source SDK run must establish
fixed GREEN in both actual OS size modes. Windows/browser checks cannot compile
or execute this XCTest and are not a substitute for that required evidence.

Apple documents `exists` as presence in the current UI hierarchy:
https://developer.apple.com/documentation/xcuiautomation/xcuielement/exists
Presence does not replace the separate hit-testing and keyboard checks.
