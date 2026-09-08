# Confirmed shared writes must not become pending again

## Scope and data safety

The user confirmed that the older affected groups contain real data, although they are no longer active, and that the warning also appeared elsewhere. No real group was deleted, archived, reconciled, or edited. No outbox was cleared on any user device. This patch does not resolve the historical financial/identity differences described in `QA_PENDING_SYNC_POST_4.31_2026-09-08.md`, and those differences must not be silently discarded.

This is a confirmed code defect, not proof that it accounts for every warning on the reporting phone. The phone's exact current outbox has not been inspected.

## Cause and fix

Canonical shared-group persistence and personal workspace persistence have separate acknowledgements. When all selected group writes succeeded but the later personal workspace write failed, the save pipeline supplied `sharedEventPersisted` and the server-merged `persistedState`. Recovery did not consistently adopt that state or remove the confirmed group targets from the durable pending selection.

`src/data/localStore.mjs` now recognizes that complete shared receipt in both partial-state adoption and pending-target selection. The personal outbox remains durable with an explicitly empty group selection. Its retry writes only the unacknowledged personal workspace, without re-publishing already confirmed group data. Existing scope, generation, and exact-payload checks remain in force. No authorization or lock guards were relaxed.

The existing UI policy is unchanged: a confirmed group is not labelled undelivered, but Home continues to disclose the genuinely pending personal backup until it is acknowledged.

## Regression evidence

- Before the implementation, three behavioral regressions failed at the expected assertion: successful canonical payloads still left `healthy` and `failing` in the pending group list. Evidence: `work/pending-receipt-red-20260908.log`.
- Expanded coverage exercises save, flush, and startup recovery for both HTTP 403 and 503 personal failures; verifies actual final canonical and personal payloads, retained merged notes, restart, and no repeat canonical writes.
- Another regression checks that a newer rejected group edit cannot discard an earlier confirmed group's pending personal backup.
- A UI policy regression asserts both sides: no false group warning and a truthful pending Home warning until receipt.
- The first green attempt exposed an incorrect test assumption that merge preserves event-array order. Assertions now find events by stable ID, still checking the same note content. This correction does not change the original red failure or weaken content checks.

## Browser verification and fixture correction

Two independent identities, storage areas and browser engines (Android-profile Chromium and iPhone-profile WebKit) create a note through the UI, observe it on the peer, retain a rejected personal receipt, restart, and verify receipt recovery without another canonical write. All remote traffic is intercepted by a synthetic CAS fixture; these tests do not exercise production RLS, push delivery or a physical iPhone.

The initial full run passed 7/8 scenarios; the iPhone receipt scenario met its data assertions but failed the strict page-error check during reload. A focused repeat passed 4/6. A minimal page without application code also reproduced WebKit's `Fetch API cannot load ... due to access control checks` while reloading intercepted, cross-origin background fetches whose promise rejections were caught. Probe: `work/probe-webkit-reload-20260908.mjs`. Playwright's bundled WebKit handler categorizes JavaScript-source console errors as page errors, so the event alone is not evidence of an uncaught application exception.

The receipt regression is specifically a restart *after a completed failed persistence attempt*, not an abrupt mid-request crash. It now lets that network pass settle before reloading. The personal HTTP 403 remains enabled during the first restart; all durable-state, peer-delivery and strict zero-page-error assertions remain. No error is filtered, ignored, or suppressed in production or the test fixture. With that precondition, all six repeated scenarios passed (three per engine).

This does not claim to fix WebKit's handling of interrupted cross-origin requests. Abrupt transport interruption is a separate behavior from the completed-receipt regression.

## Verification status

- `npm test`: **2,747 passed**, zero failed or skipped. Log: `work/pending-receipt-final-unit-20260908.log`.
- Focused two-client browser repeat: **6/6 passed**. Log: `work/pending-receipt-settled-repeat-20260908.log`.
- Full final two-client suite: **8/8 passed** in 59 seconds, including receipt recovery, account linking with an unrelated pending group, note CRUD/offline recovery, concurrent CAS edits, settings, expense/event closure, and durable outbox restart during a cloud outage. Log: `work/pending-receipt-final-sync-20260908.log`.
- The final synthetic note create/edit/delete and reconnect deliveries measured 880–1,409 ms; these local fixture measurements are not production latency guarantees. Both browsers retained strict zero-page-error assertions.
- Visually inspected the generated iPhone-profile notes screen and the running local app; no blank/error overlay was observed. This was not a comprehensive layout audit.
- `git diff --check`: passed; only normal CRLF conversion warnings.

No commit, push, new native build, or deployment has been performed for this patch. Play 4.31 (159) and the previously published PWA 479 do not yet contain it. Unrelated concurrent SQL/schema and database-test working-tree changes are outside this patch and were preserved.
