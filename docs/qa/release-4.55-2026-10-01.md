# Unified 4.55 candidate — 1 October 2026

This draft integrates main's per-payer contribution display and email login with PR 28's Apple provider discovery and WebKit payer-button fixes. PWA 505 invalidates the previous cache; native 4.55 (185) is a proposed build, not an uploaded binary.

## Integrated work

- PR 30 (`9e30b61`): restrict the account-link identity assertion to the expected participant roster row. The payer name also exists in the expense ledger. CI run 36854032574 failed with the original assertion's strict-mode ambiguity, then passed 13 candidate/nearby scenarios without skips, unexpected failures or flaky results. All original state and cross-device assertions remain.
- PR 31 (`35d66a2`): an unchanged recurring failure clears pending recovery progress. A pass/failure/pass sequence must keep an incident open; two consecutive passes still close it. The behavioral regression failed before the fix and the 14 focused checks pass afterward.
- PR 32 (`04e22a1`): missing signing material cannot create a replacement identity for an existing Android app; a mismatched key cannot replace the documented certificate or App Links. Five of nine behavioral regressions failed before the fix, and all 30 focused/nearby checks pass afterward. Tests use isolated synthetic material and a signing-tool stub.

## Validation status

- The initial main + PR 28 source passed 3,148 local unit/integration tests without skips.
- The candidate cache/native release stamps passed 43 focused PWA, service-worker and iOS preparation tests.
- The integrated 4.55 source passed 3,160 local unit/integration tests without failures or skips. Final-candidate browser CI results are tracked on this draft PR. Independent earlier PR results do not substitute for testing the integrated source.
- Local Playwright browser installation was blocked by invalid/truncated download archives. No local or physical-device browser verification is claimed.
- PR 28's offline/reload WebKit diagnostic failure did not reproduce in the new focused baseline: both repayment restart journeys and all three strict error-guard probes passed five repetitions each (25/25, CI run 36853455366). The full sync lane is being rerun. No speculative fixture correction was applied; the strict unexpected-error assertion is retained.

## Remaining release boundaries

- Read the current 4.52 rejection details and Beta Review/tester state in App Store Connect. The 30 September notification does not state the new rejection reason.
- Verify build-number availability before building 185. The already-processed TestFlight 4.54 (184) is older source and does not include main's per-payer amount display.
- Complete a real iPhone Apple/Hide My Email sign-in, same-account return and core event journey. Simulated providers do not verify this.
- Restore the original Android upload key and credentials, and compare only public certificates with Play Console before preparing a signed AAB. No key reset is authorized by this draft.
- Record the existing Render recovery deployment and deploy the same verified release source to primary/recovery; strict availability and source-parity checks must pass. The recovery currently serves older app source. The incident-streak correction alone does not update that service.
- The checked-in Android download is an older signed APK, not build 185 and not proof that this candidate was built or published.

No production deployment, store submission, tester invitation or real user-data change was performed while preparing this draft.
