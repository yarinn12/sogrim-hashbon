# WebKit choice press regression — 2026-09-30

## Failure and cause

The participant identity journey intermittently failed to open the payer picker
on Linux WebKit iPhone and iPad profiles. The recorded input reached the same
connected, enabled label on pointerdown and pointerup, with identical bounds.
No handler stopped the input; WebKit never dispatched the subsequent click.

`syncChoiceTrigger` replaced the label text node on every enhancement, even
when its value was unchanged. Its own child-list mutation scheduled another
enhancement. Replacing the pressed text node between down and up loses the
WebKit click. The fix updates the label only when the normalized text changes.
Real option changes, account labels, and the empty placeholder still update.

## Reproduction and regression evidence

- Original CI failure: QA run 36710351853 (iPad) and 36714349470 (iPhone),
  `participant identity uses colored or grayscale pictures without status dots`.
- An isolated diagnostic branch recorded input events without changing the
  journey or application. Run 36717101668 reproduced the failure on both WebKit
  profiles; iPhone failed once in 20 repetitions, with 19 successes.
- New normal-suite browser regression holds the pointer for 120 ms across
  animation frames, then requires the picker to open and an actual new payer
  selection to update the expense field. This failed locally before the fix
  with the picker absent, and passed after the fix.
- The new Node regression failed before the fix because an unchanged label
  node was replaced. Both Node cases pass afterward, including changed labels
  and empty options. These tests run under `npm test`.
- 22 focused Node tests passed. The original and held-press browser journeys
  passed 20/20 repetitions across iPhone and iPad WebKit, with retries disabled.
- The isolated fix passed all 3,097 Node/integration tests. The release candidate
  also integrates the existing Apple provider parity candidate from PR 24 and
  the current main email-login fixes. All 3,144 Node/integration tests pass on
  that combined source. Full mobile and two-client QA run separately in PR CI.

The integration retains the renewed App Store authentication completion step
and manual-only upload trigger, while retaining the Apple provider preflight
and iPhone/iPad login checks. It does not replace the new upload completion
with the older action's expiring-token processing loop.

PWA 504 invalidates the previous cached picker module. Native 4.54 (184)
supersedes both main's 4.52 (182) and the separate Apple beta 4.53 (183).
Build preparation is not proof of store publication. No physical phone or
full Apple sign-in/Hide My Email return flow was exercised by these tests.
No real account or group data was modified for this regression.
