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
- The complete local normal suite passes **3,250/3,251**, zero skips. The only failure is the unchanged Windows directory-junction check denied by the sandbox (`EPERM`); Windows/Linux CI execute it without that restriction. Final source SHA and exact CI results are recorded in the task evidence and draft PR.

Browser measurements use a synthetic backend and injected lifecycle events. They demonstrate queue independence and UI behavior; they are not real phone, carrier-network or production API latency guarantees. Installed Google Play behavior requires the next release and subsequent device verification. An initial local test-server readiness failure was caused by an expired turn-scoped network grant; the same unmodified runner passed after network permission was restored.
