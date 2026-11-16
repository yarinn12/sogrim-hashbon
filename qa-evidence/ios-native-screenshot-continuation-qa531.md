# Original QA531 screenshot failure and async continuation

The original iOS Native job 132671258456 in run 43667078666, attempt 1,
tested source `deed740db8dc839454bfb7146db6fbc45aaf955c`. The system screenshot
request at `keyboard-amount` recorded a timeout. The async XCTest method then
continued to `nextPoint`, name input and save despite that failure. The later
name-typing timeout is not independent evidence that the application could not
save. Native acceptance failed, and that source must not be signed or delivered.

The original artifact 14143348795 was retained with its full ZIP, SHA-256 and
CRC verification. It contains successful captures through `keyboard-amount`,
then an error for real native name typing. The observer also reports timeouts
of host `ps` and `sample` commands. These observations do not establish why the
system screenshot request stalled, or establish an application defect.

The change checks XCTest's `testRun.totalFailureCount` immediately after each
required successful-path system screenshot. A recorded failure or unavailable
run state returns from the async method before later native input, relaunch or
the success marker. All screenshot requests and attachments remain required;
the original error is neither swallowed nor retried. Native input, ACK,
lifecycle, persistence, real OS text sizes and their existing budgets remain.
The startup-diagnostics content seal now permits exactly the four reviewed
stop lines and their explanatory comment. Removing only those additions and
the previously reviewed startup stop must still recover the unchanged original
action/deadline SHA-256 seal. The first full local run caught the old seal
mismatch; its two failures are retained. No assertion or timeout was removed.

`tests/iosParityScreenshotFailure.test.mjs` is a source-backed control-flow model
for local Windows execution. OLD has three failing controls; FINAL passes them
and all 26 nearby controls, including the original content seal. This is not execution of Swift, XCTest or a
physical iPhone. Final acceptance still requires the original Native job and
all four CI lanes on the final exact source, including full normal/large-text
journeys. A further screenshot failure must block delivery again.

Apple references:

- https://developer.apple.com/documentation/xctest/xctestrun/totalfailurecount
- https://developer.apple.com/documentation/xctest/xctest/testrun
