# Synchronization and loading responsiveness — 2026-10-06

Release remains deferred; this source change extends draft PR #38. It does not deploy the site, apply a live migration or upload a Google Play build.

## Reproduced queue delay

`requestResumeSync` waited for friend-network and notification-inbox reads before releasing its financial refresh slot. A forced refresh after native resume/reconnect therefore queued new expense data behind an unrelated slow request, even after the preceding financial read had completed. Two new normal behavioral regressions hold each secondary request separately. On the old code both fail because only one financial read starts; the fresh expense does not reach the state until that unrelated request is released.

The financial queue now completes when its own read/merge finishes. Friend and inbox refreshes continue in the background with their existing account/session/request ownership guards. Their rejection remains reported for the current session, and their late results cannot replace another account's state. Financial writes, cloud acknowledgements, pending outboxes, forced-read coalescing, shared-event permissions and the existing economical polling intervals retain their contracts. No read/write timeout or failure assertion is reduced to manufacture a speed improvement.

## Verification and measured boundaries

- Before: two held-secondary regressions fail with `reads: 1`, expected `2`.
- After: 108 adjacent account/session, visible-event, foreground sync, notification recovery and cached-read tests pass, with zero skips. The new cases assert the fresh expense is applied and the financial queue is released while the secondary request is still held.
- Four new two-client scenarios use independent Android Chromium and iPhone WebKit identities. Each holds a real HTTP friendship/inbox response, saves an expense through the other client's UI, inspects the committed canonical receipt, triggers native resume and verifies the recipient's durable state and visible expense before releasing the held request. Measured signal-to-durable-update times were **191, 77, 80 and 87 ms**, within the fixed 2.5-second assertion budget. The same run passes the four new notification failure/offline/restart cases: **8/8**, zero skips.
- 24 mobile loading/navigation cases pass in Android and iPhone profiles, including delayed account history, slow/rejected initial event publication, stale locks, settings, participant dialogs, share, expense creation/editing, notes and workspace tabs during slow synchronization. Dialog visibility assertions retain their 800 ms bound with a simulated 2.5-second backend delay. Test durations include setup and must not be presented as action latency.
- The complete local normal suite with the five recorder regressions below passes **3,255/3,256**, zero skips. The only final-run failure is the unchanged Windows directory-junction check denied by the sandbox (`EPERM`); Windows/Linux CI execute it without that restriction. An intermediate run additionally hit a transient `mkdir EPERM` in an unchanged iOS fixture; that test passed in the final unmodified rerun. Final source SHA and exact CI results are recorded in the task evidence and draft PR.

Browser measurements use a synthetic backend and injected lifecycle events. They demonstrate queue independence and UI behavior; they are not real phone, carrier-network or production API latency guarantees. Installed Google Play behavior requires the next release and subsequent device verification. An initial local test-server readiness failure was caused by an expired turn-scoped network grant; the same unmodified runner passed after network permission was restored.

## Delayed WebKit diagnostics in the synchronization fixture

The notification candidate `f174d406` exposed two CI failures in otherwise successful self-leave/account-link recovery scenarios. Their unconditional error guard recorded WebKit's native CORS diagnostic for a deliberately disconnected snapshot request. The fixture had already cleared its mutable URL marker on a healthy retry before the earlier diagnostic arrived. This is a fixture classification race, not evidence of a new application exception or lost financial write.

Five normal-suite behavioral checks cover this boundary. Replaying the unchanged checks with the recorder from `0404b877` fails four: delayed diagnostic retention, single-use classification, rejecting a URL marker without an issued request, and preserving two distinct aborted requests. The current recorder passes all five. The fixture now records each exact intentional request once by request identity; a native diagnostic consumes one matching receipt. Healthy retries neither erase outstanding receipts nor create new receipts. A second unplanned diagnostic, another URL, and all runtime error/unhandled-rejection events remain failures. No financial, ownership, permission, persistence or timing assertion is removed or relaxed.

The three actual WebKit error-recorder probes plus the two Android self-leave scenarios and the independent account-link-with-pending-sibling scenario pass locally: **6/6**, zero skips. Full normal-suite and independent-browser CI results for the final tree are retained in the task evidence; the earlier failed job remains documented rather than treated as a passing rerun.

## Visible navigation hit testing

Candidate `583ce648` passes all 88 independent-browser synchronization tests, but its Android mobile lane exposes a separate fixture fault in the core journey after expense participants expand. The retained screenshot and trace show navigation intentionally clipped beneath the fixed route controls with `--event-nav-route-occlusion: 37px`. The guard probes the original button rectangle's center, inside that masked area, and reports the underlying screen as a blocker even though the visible portion remains reachable. Ten unmodified local repetitions pass; they are diagnostic evidence of intermittency, not a fix or a replacement for the failed CI result.

A new deterministic browser regression scrolls the actual event navigation until its button centers are masked. Before the guard change it fails in both Android Chromium and iPhone WebKit at the same unconditional reachability assertion. The corrected measurement samples the center of the portion painted by the actual computed top inset. It does not skip a partly visible control. The regression also adds an unexpected overlay and requires the same guard to fail, removes it, and performs an actual click on the visible summary button to verify navigation. The new case and existing core journey run in all five browser/font profiles without changing application CSS, introducing retries or weakening the tappability assertion.

Exact final before/after totals and source-specific CI results are retained in the task evidence. The captured failed Android artifact remains available with its original candidate SHA.
