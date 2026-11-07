# Creation sharing and permission recovery — 17 October 2026

The reported Android flow opened the new event without showing its requested link/QR sharing screen. Earlier reports described a creation permission error and a recurring account summary for five pending events. These fixes extend the private-event creation correction documented in `event-creation-permission-2026-10-17.md`.

## Behavior and boundaries

Creation now opens the existing verified link/QR route after local durable acceptance. Its preparation waits for the original cloud request, then uses the same publication, account-index acknowledgement and server-issued invitation checks as an existing event. An unrelated older failed event cannot discard this navigation request. Copy, WhatsApp and QR remain unavailable until verification succeeds. Leaving the route or changing account prevents delayed preparation from reopening it. A late authoritative creation denial restores the submitted draft for that same visible event before the missing-event redirect; it never acknowledges a rejected save.

Permanent delivery failures are retained across a WebView restart. A local receipt is bound to the account and exact outbox revision; legacy outboxes without a revision use an exact local payload comparison. Recording a failure writes a separate receipt, never the primary outbox. An obsolete receipt cannot erase a second tab's newer intent or stop its delivery. Normal outbox saves carry only unchanged failed shared projections, including referenced participant profiles, so a new explicit edit releases its own hold. Private/bootstrap normalization cannot replay unchanged denied shared edits. User-requested retry bypasses the hold and still requires actual server acknowledgements. Receipt cleanup follows successful outbox acknowledgement or clearing that account's local data, preserving other accounts. Revision generation supports older iOS without `crypto.randomUUID`.

The account warning lists all pending events with individual navigation and known reasons. One event's permission failure is not attributed to every event. The list remains stable while observers refresh status. Pending changes remain on the device; no dismissal or success message substitutes for cloud delivery.

No production authorization, schema, financial rules, native build numbers or release switches are changed. No live user data, credentials or Apple account metadata are included in tests or this document.

## Regression evidence

| Scenario | Before | Required corrected result |
|---|---|---|
| Creation requests a link while old delivery is pending | No share-route call | Existing link/QR route opens |
| Slow creation publication | Only event visible | Share route displays loading immediately; verified controls remain gated |
| Real mobile creation sharing | Unchanged `01da07f` fails because modal is absent | Android Chromium and iPhone WebKit show the same verified URL and QR as the existing-event route |
| Late creation denial | Missing event redirects home and loses the form | Same submitted name, participants and settings restored; no issued link |
| Restart after five known denied writes | Old source repeats denied requests | No additional automatic denied writes; explicit retry reaches all five targets |
| Shared profile changes after a hold | New profile remains blocked | Full shared projection reaches canonical ACK |
| Second tab changes outbox at receipt write | Previous implementation rewrites older intent | Exact newer bytes survive; restarted client delivers them |
| iOS without randomUUID | Durable outbox save fails | Valid durable revision and retained content |
| Receipt cleanup after ACK/sign-out | Legacy account snapshot remains | Matching receipt removed; other account receipt unchanged |

`tests/eventCreationResponsiveness.test.mjs`, `tests/sharedSyncPartialFailure.test.mjs` and `tests/saveFeedbackPolicy.test.mjs` retain the behavioral regressions in the normal suite. The original authenticated PGlite schema/RLS integration test remains included. Mobile coverage extends `event-creation-save.spec.mjs`; independent client tests retain final canonical and personal receipt checks.

The previous tests expecting a permanent403 to be automatically retried after restarting have been updated to require an explicit user retry. They additionally assert that the outbox remains before that action and clears only after acknowledgement, with no duplicate shared publication. Transient recovery remains automatic. The service-restriction metadata assertion now verifies the added local revision plus the exact version and selection; its full queued content and cloud recovery assertions remain intact. The immutable snapshot wiring assertion follows the new selection adapter without weakening the actual concurrent/account-boundary tests. Early mobile diagnostics used nonexistent Close/menu controls; the fixture now follows the actual existing-event participant/share route. No timeout, retry, skip or error assertion was relaxed.

## Acceptance and delivery

Run `npm run qa:architecture`, `npm test`, the affected Android/iPhone mobile cases and the complete `npm run qa:sync` on the frozen source. Focused OLD failures, corrected mobile screenshots and local logs are stored separately outside Git. Final counts, immutable source/tree, four-lane CI and native package receipts belong to the release acceptance record; an earlier source's passing results cannot approve this one.

These synthetic tests do not verify the reporter's installed phone or a physical iPhone. After a corrected internal Android/TestFlight package is installed, verify creation, link/QR sharing and pending recovery on the device. Preserve app storage and existing pending changes during verification. Public release remains gated by the user's check and the existing database/store requirements.
