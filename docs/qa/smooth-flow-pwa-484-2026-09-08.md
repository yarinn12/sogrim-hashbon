# Smooth-flow verification and first offline launch — PWA 484

This follow-up audits the existing 4.35 journeys and fixes a separately reproduced browser-cache defect. Android remains 4.35 (163): its native runtime uses bundled assets and disables the browser service worker. No native binary, database schema or financial data repair is part of this web patch.

## Reproduced defect

A fresh first page loaded before the service worker controlled its requests. Installation cached eight entry assets, while the module graph was merely listed in `CACHE_FILES`, not actually included in the critical install set. Disconnecting and reloading immediately after the worker became ready therefore returned an HTML shell with missing executable dependencies. The initial Chromium reproduction failed with missing `/src/domain/sharedStateMerge.mjs` and other code modules.

The worker now caches the full listed JavaScript/CSS runtime before activation. Six concurrent downloads limit network contention. Each download uses the existing bounded no-store network helper. HTTP errors, incorrect MIME types, cache-write failures and stalls reject installation; an incomplete new cache is not activated. Optional media and secondary documents still do not delay installation. This follows the install-event lifetime model described in [MDN's service-worker lifecycle documentation](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Before/after protection

Five normal-suite regressions execute the actual worker: traverse the real HTML entry modules and their transitive imports and read the exact cached source offline; verify bounded concurrency and complete dependency coverage; reject a missing dependency on HTTP, storage and timeout failures. A controlled baseline copy of the previous worker fails all five while its other 16 cases pass. Final focused PWA/worker run: 37 passed.

`e2e/pwa-offline-journey.spec.mjs` uses a real service worker and an isolated local origin. The previous worker fails the first reload on both Chromium and WebKit. With the fix the app opens, saves one expense of 1,234 minor units and one note, and preserves the exact values and counts after another outage reload and an online reload. All five viewport profiles pass with no page errors.

The available Windows WebKit runtime rejects `setOffline()` navigation before its service worker can serve the cached response. Its browser scenario therefore exercises a real local HTTP 503 origin outage; Chromium additionally disconnects the whole client. This is not claimed as a physical iOS airplane-mode test. The original failed WebKit experiment is retained separately rather than counted as a product regression or silently skipped.

Evidence logs under private `work/`:

- `smooth-flow-4.35-pwa-root.log`: initial browser reproduction.
- `smooth-flow-pwa-runtime-baseline-red-root.log`: 5 failed / 16 passed against the previous worker.
- `smooth-flow-pwa-browser-baseline-red-root.log`: both first-reload browser cases fail against the previous worker.
- `smooth-flow-pwa-runtime-green-root.log`: 37 passed after the fix.
- `smooth-flow-pwa484-unit-final-root.log`: **2,802 passed**, no failures or skips.
- `smooth-flow-pwa484-browser-final-root.log`: **16 passed, 4 existing platform skips**, no failures. Covers first install, standalone mode, cached reload and replacement of an old worker across Android, iPhone, iPad, large text and narrow reflow. The four skips are iOS-only install/chrome checks on the two Chromium profiles; the new regression runs on every profile.

## Wider flow verification

Before the cache-only patch, **64 focused Android/iPhone interaction checks passed**: screens respond while foreground sync is slow, return focus/scroll without interrupting a new action, preserve validation drafts, handle real-shaped 403/503/delayed/partial save responses, recover notes after restart without duplicate creation/deletion, and preserve exact monetary calculations and paid undo. Log: `smooth-flow-4.35-interaction-root.log`.

The guarded live two-account script passed **42 checks** on the actual production endpoints using temporary, unique synthetic accounts/groups. It verifies invitation redemption/replacement, signed-in browser joining, owner/member access, concurrent writes, guest-to-account linking, deletion tombstones, financial state, transfer status, closure, membership departure and rejection of removed-member writes. All temporary records/accounts were cleaned up and the process exited successfully. Across 20 sync samples: median 596.5 ms, p95 1,802.1 ms, maximum 2,469.7 ms. Log: `smooth-flow-4.35-two-account-live-root.log`. These are measurements from that run, not a universal latency guarantee.

Live read-only navigation through Korea's expenses, summary and notes remained responsive; its existing totals and single linked Liron identity were preserved. The previously observed Home permissions warning for historical groups can return after a later retry. This web-cache patch does not claim to remove that warning or discard those groups' pending changes. Priority remains Korea, Philippines and new groups.

No Android device or emulator was attached (`adb devices -l` returned no devices). Physical-device background termination and real iOS offline launch remain unverified. CI and live deployment status must be recorded against their actual commit separately; local evidence above does not claim an unfinished CI lane has passed.
