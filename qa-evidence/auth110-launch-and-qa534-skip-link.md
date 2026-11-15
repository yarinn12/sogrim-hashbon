# Original Auth110 launch failure and QA534 header obstruction

Source701fde05f3e624ea9851a29600e5f211874be231 is rejected for release.
Its5533 normal checks, Windows215, fonts126, ordinary iOS/Android Native jobs
and two-client synchronization job passed, but those do not override either
original failure below. No193/197 package was signed or uploaded.

## Auth110: before the authentication scenario

Run43678757570, job132704579599, artifact14147044817:
69115852 bytes; SHA256
0a03d89c8fe0fa4e3ceabf6ef0c0dd8e2a4bac52db1db08ce9fbda08ae9ef313.
Full size/digest/ZIP CRC verified. The original test failed its first app.launch
via Xcode after109.953 seconds; the HTTP fixture recorded only PROBE_HTTP_READY.
The owned boot transcript was accepted. Original launchd records show the app
spawned at05:02:42.919UTC and was terminated by xcodebuild at05:03:01.626UTC.
A DebuggerVersionStore error is present. The cause of the delayed launch is not
proven; there is no claim that the app's authentication code ran or failed.

The isolated QA generator now disables optional LLDB attachment in its generated
Run/Test actions, using an empty debugger and PosixSpawn launcher. The shipping
scheme, Debug build configuration, owned clean simulator, original cold launch
and relaunch, XCTest Swift literal, startup/auth/hard/outer deadlines, real
ASWebAuthenticationSession/PKCE/account/write assertions all remain unchanged.
The transformer accepts only its exact enabled AuthProbeUITests target and known
launchers, preserves every other scheme byte and rejects ambiguous input.

OLD generated configuration fails three of eight scheme controls. FINAL passes
47 nearby scheme, phase, host, boot and callback controls. These prove scheme
generation and preserved test contracts on Windows, not the historical LLDB
cause or successful Apple SDK execution. One initial local harness report failed
because the generator's policy message preceded JSON; that log is retained. The
harness now captures that diagnostic stream and reads its structured result;
none of the scheme/auth assertions were weakened. A new original SDK run is
mandatory before acceptance.

Apple documents Debug Executable as optional Run/Test debugger attachment:
https://developer.apple.com/documentation/xcode/customizing-the-build-schemes-for-a-project
Apple's debugging startup discussion is contextual, not proof for this archive:
https://developer.apple.com/forums/thread/800067

## QA534 iPhone WebKit shard6: transient header obstruction

Run43678757643, job132705084304, artifact14147618193:
22516568 bytes; SHA256
31fc8ffe969bb293817c20112d26e914567aff2e7141085eabab8c2f3130cadd.
Full size/digest/ZIP CRC verified. The original core journey's first home hit
check found the unfocused skip-link blocking the profile button. Retry passed;
failOnFlakyTests correctly rejected the job. The failure screenshot, trace and
retry screenshot are retained. The exact original animation frame sequence is
not reconstructed by the final screenshot.

A controlled browser reproduction uses the actual old stylesheet and anchor,
places the unfocused anchor within the viewport to model style activation, and
checks the real profile hit point over twelve frames. OLD fails because the
anchor intercepts the profile tap. Base CSS now makes the unfocused skip link
transparent and noninteractive before late modules load; focus restores visibility
and pointer input. The presentation layer no longer animates its transform.
The link remains focusable and its Enter handler still moves focus to main content
without navigation or discarding a draft. No controls or hit-test assertions are
removed. The existing full core journey and keyboard/draft test remain required
across all five browser/font profiles. An intermediate local fix exposed delayed
opacity on keyboard focus in all five profiles; the original failures are retained.
Computed CSS and active animation evidence identified the active Ledger layer's
generic anchor transition. Its specific skip-link transition is now disabled too.
FINAL: all15 original core, keyboard/draft and new obstruction cases pass over
the five profiles, with zero failures, skips, retries or flaky cases.

All pending event data and shared/personal ACK rules are untouched. Full normal
checks plus four fresh original CI lanes and all68 QA jobs on one final source
are still required before test-only193/197 signing and distribution. The actual
six phone events have not been read, cleared, or claimed recovered.
