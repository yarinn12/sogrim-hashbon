# Android Native trace transport regression

QA #429 ([run 38113596895](https://github.com/yarinn12/sogrim-hashbon/actions/runs/38113596895)) checked source `7b969f8ea4933669fa10d69fc740778789c682d1`, tree `eca6195aa529e662749734d6ab399c1e340bde85`. This source was rejected: Android Native had one actual target-app ANR in PID 6772 at 05:15:35 UTC, after a FocusEvent waited 5,001 ms. The matrix passed 198 checks and the journey passed eight; pages produced 20 of 24 samples and failed to establish the first landscape baseline because the owned Activity foreground timed out before any rotation command. Subsequent ratio/disclosure failures depend on the missing baseline. Clipping and after-health were not run. The original ANR gate remains a failure, including after later recovery.

The APK is 23,826,872 bytes, SHA-256 `d555541d69f5da53c10cd2ad1c7ed90717bd14bc75596ec16d335bba64770b9e`. Android artifact 11693096231 is 115,268,534 bytes, SHA-256 `fd62541f58ff5c9623634b9030f0e259413a259499eeeb07f6cc2b1da3d168ee`. Root independently checked the archive size and digest. The ANR dump shows main waiting in DrawFrameTask/HardwareRenderer, RenderThread waiting on a condition and Chrome GPU waiting in eglCreateSyncKHR/qemu_pipe. A waiting stack alone does not establish the ultimate cause. Actual partial-trace parsing reported two packet-loss groups; rendering/scheduling interpretation must retain its coverage limits.

## Two diagnostic defects

1. The close-write watcher redirected its journal into `/data/misc/perfetto-traces`, where traced can create its recording but the shell cannot create a journal. Move the journal beside the exclusively reserved, owned config in `/data/misc/perfetto-configs`, with umask 077 and noclobber. Keep all inode checks, registration-before-TERM, PID/start-tick/command ownership, close acknowledgment and owned watcher cleanup.
2. Actual adb pull succeeded and produced 189,789,438 bytes, with its standard single-file transfer receipt on stderr. The generic command check incorrectly rejected that success. Recognize only the exact owned single-file pull protocol: exit zero, empty stdout, matching remote and local paths, one file pulled/zero skipped, finite transfer fields and byte count matching an actual regular, non-symlink host file. Extra text, errors, other commands, missing/mismatched files and nonzero exits remain rejected. Pulling bytes never substitutes for the missing close acknowledgment.

Exact raw SDK command fixtures and origin/digest metadata live in `tests/fixtures/android-native-7b969f8-{close-raw,pull-raw}.txt` and `android-native-7b969f8-origin.json`. Git attributes preserve those recorded bytes across Windows and Linux. The behavioral tests are in the normal `tests/androidNativeTraceDiagnostics.test.mjs` suite.

## Before and after

Owner candidate `c81ff424dd927126112529f20211e72bc801ddea` is based on 7b969f8, tree `d4ade15bbe8588efa81e7768b3fab172842d59c9`. Root imported it as `e265c119e901e1926a294cea56f9b828acf525e3` with the identical tree. Patch SHA-256 is `9d46b4164ec5a88fd168db87e5dae6caa53274a3a6b0d50bcc2d247a47ede4ed`.

- Same final focused tests against the original helper: 28 passed, three failed for the recorded transport/journal defects.
- Exact restored helper: 31/31 focused, 117/117 nearby and 3,474/3,474 normal tests passed, without failures, skips or cancellations. Normal suite duration was 22,173.9745 ms; private environment autoload was disabled.
- Nineteen controlled boundary mutations failed behaviorally; exact source restoration was checked. Host shell syntax/reservation/journal controls passed. These host checks did not execute Android mksh, SELinux or the SDK.
- The actual 189,789,438-byte input was retained and replayed. The original incomplete recording still fails the completed-capture path because it lacks a close acknowledgment.
- Root independently verified 16 receipt file sizes and SHA-256 digests, including the patch, candidate files and regression logs.

This is a QA transport fix, not an ANR fix. Product source, renderer choice, emulator resources, trace buffers, workflow budgets and acceptance gates are unchanged. The next exact-source SDK run must prove real journal creation and writer closure, retain complete ANR history and support actual Trace Processor loss/clock/thread/frame coverage review. A later green run alone does not prove the earlier ANR cause fixed.

The completed previous source separately passed Linux/Windows 3,469 each, fonts nine, sync 91, cross-engine 302 plus four applicability skips, five mobile matrices 1,542 plus 38 applicability skips and iOS Native 13 captures in each default/Accessibility XL mode. Those results belong to 7b969f8; they are not acceptance of the new source. A physical iPhone was unavailable.
