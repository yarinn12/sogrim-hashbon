# QA533 recovery editing and delayed heading focus

Original source: c30c571a6e6b20a86932dbbeb45a65f367201d5c.
Original QA run43673805754, Android mobile shard1 job132692673089.
Artifact14146644963: 16102160 bytes, SHA256
07d8ab92a8b1afe7e70f21e6952840cb88e322a3daabf1f34e02963d77966409;
full archive size, digest and CRC verified locally.

The first original attempt failed before rotation: expected the new synthetic
email, received that email followed by the old fixture address. Its retry passed;
failOnFlakyTests rejected the source. The original trace alone does not establish
which event changed selection/focus. No original failure is waived or rerun.

Controlled OLD reproduction executes the actual renderAccountRecoveryScreen
callback after select-all in the real email control. The callback focuses the
heading, interrupting editing. OLD: three of five source-backed VM controls fail,
plus one Android browser regression fails because the email loses focus. The
unchanged callback on a detached/replaced gate remains inert.

FINAL: heading focus is conditional on no active control having claimed focus.
Five VM controls and nearby account presentation checks pass; 15 browser cases
pass over Android Chromium, iPhone/iPad WebKit, enlarged iPhone and 320px reflow,
without retries. They retain the original empty/malformed email and orientation
cases. The new test asserts focus, real keyboard deletion and replacement, draft
after rotation, readable enlarged layout, successful screen and the exact single
recipient payload at the intercepted synthetic HTTP boundary. No real email or
production service is called. Browser emulation is not a physical-device test.

The change does not touch event financial logic, snapshots, acknowledgements,
permissions, pending queues, Native drivers or test deadlines. Full normal checks
and all four original CI lanes/68 required QA jobs must pass on the final source
before Android193/iOS197 signing. Prepared f983 tooling bound to rejected c30 may
not publish/sign; both store updates remain test-only. Actual pending phone edits
have not been read, cleared or claimed recovered.
