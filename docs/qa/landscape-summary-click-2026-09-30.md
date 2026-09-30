# Landscape close-event QA: preserve the verified scroll position

## Root cause

PR 28 QA run `36745920693`, job `109992361881` (`iphone-large-text`),
reported one flaky landscape close-event confirmation journey. The initial
attempt timed out clicking the summary tab; the automatic retry passed.
`failOnFlakyTests` correctly failed the job.

The original trace shows that the test deliberately positioned the tab below
the floating route controls and verified its center with `elementFromPoint`.
The document scroll position was 345. During the first click stability check,
the tab moved slightly, so Playwright retried the action. Playwright's pointer
retry implementation cycles through end/center/start scroll alignments. That
additional scroll undid the already-verified placement: scrollY became 409,
416, then approximately 420, and the click point moved to y=55, 49, then 45.
The fixed controls end at y=58. The navigation's intentional clip-path then
excluded the click point, so the containing screen received the hit test.

The original application UI did not navigate or replace the target during
this failure. The unwanted scroll was performed by the automation's retry,
not by a user tap or an application scroll handler. Local instrumentation
also observed the summary button moving by one pixel as hover settled.

## Reproduction and fixture correction

Eight unchanged local repetitions and five instrumented repetitions passed;
those passes alone did not explain or resolve the CI failure. To exercise the
observed stability retry, the landscape case now includes a finite one-pixel,
250 ms animation immediately before the click. With the original default
click, both controlled repetitions failed at the same intercepted summary
click. Their traces show stability retries followed by the same bad alignment.

The click now uses the supported `scroll: "none"` option after explicit
placement and the existing center hit test. Playwright still checks
visibility, stability, enabled state, viewport reachability, and the hit
target, and still sends a real pointer click. It simply preserves the user's
already-established scroll position when waiting for motion to settle.
No force click, DOM click, extra test retries, skipped case, swallowed error,
or weaker dialog assertion is used.

All existing checks remain: confirmation readability and bounds, scrollable
overflow when required, accessible confirm-button dimensions and hit target,
cancel-and-return behavior, reopening the confirmation, and actual event
closure feedback. The finite movement stays in the normal landscape case to
exercise this regression on every mobile QA run.

## Evidence and validation

Evidence root outside the repository:
`outputs/release-recovery-2026-09-30/` in the parent task workspace.

- Original CI artifact `11113900937`: `large-text-qa.zip`, SHA-256
  `eef054486e693d8bd4e6ff1f0f20b0faeb28cc3523a334855176333e1e331e6f`,
  verified against GitHub's artifact digest.
- `landscape-baseline.log`: 8/8 unchanged local repetitions passed.
- `landscape-diagnostic.log`: 5/5 instrumented local repetitions passed;
  records document scroll, target/nav/control bounds, clip-path, and scroll
  call stacks. Temporary diagnostic spec is not part of the change.
- `landscape-retry-before.log` and `landscape-retry-before/`: 2/2 controlled
  reproductions failed with the old click, with screenshots and traces. The
  diagnostic run used a shorter 25-second test timeout to collect the same
  failure sooner; no suite timeout was changed.
- `landscape-retry-after.log` and `landscape-retry-after/`: all 20 cases
  passed (portrait and landscape, twice each, across Android, iPhone, iPad,
  iPhone large text, and 200% reflow), with retries disabled. After-fix iPhone
  large-text traces record two and three failed stability checks respectively,
  then successful real clicks at y=119.17 with `scroll: "none"`. The same
  motion path is therefore still exercised, rather than accidentally avoided.
- `landscape-unit-after.log`: all 3,144 unit/integration tests passed, no
  failures or skips.
- `git diff --check` passed. The Android source fingerprint was recomputed
  after the test change and still matches the signed 184 manifest:
  `DE997BD9A095E8E0E6BEA6142162ADD16C4B902A2D02B53484296ADC0341463D`
  (630 files).

This is a test-fixture correction. Application source, native versions,
release assets, store metadata, and deployment settings are unchanged.
No device or production data was modified. Fresh full candidate CI remains
the release owner's gate before publication.
