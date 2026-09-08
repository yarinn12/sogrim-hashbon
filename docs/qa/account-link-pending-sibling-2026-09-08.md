# Account linking blocked by unrelated pending synchronization

Status: fixed and verified locally on top of release commit `486886ea2ffad0f152f8cb520b3e48bf3a0a5c38`. Not committed, deployed or packaged into a new mobile release in this task. No production account link, payment, snapshot or outbox was changed.

## Evidence and diagnosis

Read-only checks of the reported group found the connected account active and authorized, but the guest identity still separate in canonical shared state and in the owner's cloud copy. There was no canonical linking receipt for that pair. The exact original phone click/log was unavailable; this does not establish whether the user saw a success notice. Recent anonymous account-link failure metrics returned no rows and cannot be attributed to a particular person.

The actual account-link UI calls `prepareSharedEventForInvitation` before creating either the merge or its durable recovery receipt. That preparation successfully publishes the target event, then also calls `saveSharedState` for the whole account. Its default cloud-acknowledgement requirement rejects even an accepted pending result from a different event. A quick permanent rejection from an unrelated outbox can also abort preparation. The user's previously observed unrelated pending conflicts make this a matching explanation, but the original phone action itself was not traced.

The failure was reproduced through the real UI orchestration and through two independent browser clients: linking stopped before the canonical link write while another event's pending mutation received 42501. The control with the old behavior failed after the unchanged 12-second test deadline.

## Fix

The account-link call now requests event-only preparation (`persistAccountState: false`). Only that caller changes behavior. Invitation callers keep their existing defaults.

The actual link save still persists its local snapshot and outbox, sends the targeted shared event and checks its canonical linking receipt before reporting success. Target-event authorization/network errors, unavailable local storage, changed participant identity and hard link rejection still stop or roll back the operation. A link lacking canonical acknowledgement remains pending with its recovery receipt. Unrelated pending user intent is retained.

An intermediate attempt using only `awaitAccountCloud: false` passed the initially focused test but failed the real two-browser test on a fast permanent sibling rejection. It was replaced by explicit event-only preparation; the broader test was not weakened.

## Regression protection

- `tests/accountLinkPendingSibling.test.mjs`: nine behavioral tests executing the actual app preparation/merge functions and actual domain/identity functions. Covers pending and permanently rejected siblings, default invitation acknowledgement, target permission/network failures, local durability failure, changed identity, hard link rollback, and no false success while confirmation is absent.
- `tests/databaseIntegrity.test.mjs`: new full-wire guest-account linking test with a forced CAS conflict, existing SQL guards under the authenticated role, expense/debt identity preservation, immutable opaque record IDs, personal-index discovery, recipient RLS read and real canonical hydration.
- `e2e-sync/two-client.spec.mjs`: new Android-profile Chromium to iPhone-profile WebKit UI flow. Starts with a real seeded durable pending sibling and a backend that rejects that sibling, links the guest from the UI, checks the peer's rendered roster and local hydrated state, verifies totals and canonical proof, and confirms the unrelated pending note remains in the outbox.

The personal workspace's embedded event is a discovery/cache copy, not an eagerly refreshed full canonical replica on every edit. An initial SQL-test assertion incorrectly expected its membership list to update immediately; it was replaced with the actual recipient RLS read and hydration boundary, preserving the assertion that the recipient's hydrated membership excludes the guest. The two-browser test separately verifies that visible result.

## Red / green evidence

- With the old account-wide preflight restored through a controlled local option mutation: 5/9 focused cases failed; the two-browser linking test failed. Source was restored immediately after the control run. No published source or unrelated user change was overwritten.
- Final source/syntax plus unit/integration suite: **2,735 passed, 0 failed, 0 skipped**. Log: `work/korea-link-unit-final.log`.
- Final independent-client synchronization suite: **6 passed**, 56.6s. The new link reached the second client in **1,392ms** while five synthetic sibling writes were rejected and the unrelated pending note remained intact. Log: `work/korea-link-sync-final.log`.
- Focused identity journeys across Android, iPhone and iPad profiles: **12 passed**, 1.2m. Log: `work/korea-link-mobile-final.log`.
- Initial scoped link run also passed in 1,596ms. The final recipient roster screenshot was visually inspected: two connected participants and no duplicate guest, with no blank page or error overlay. Browser tests captured no page errors or unexpected write routes.
- Red control logs: `work/korea-link-pre-fix-unit.log`, `work/korea-link-pre-fix-two-client.log`.
- Initial incomplete-fix diagnostics: `work/korea-link-two-client-diagnostics.log`.

## Production and verification boundaries

The local-only probe `work/probe-korea-account-link-20260908.mjs` reads the reported event and owner copy in a read-only database transaction, then exercises the actual final client payload in in-memory PostgreSQL with relevant installed production guard definitions. That simulated link passed. Its first harness run correctly failed because synthetic member workspaces had not been seeded; adding those fixture prerequisites fixed the harness, not production data or authorization. No live mutation was dispatched.

Two-client tests use a synthetic CAS/identity-scoped backend, not real hosted PostgreSQL or push notifications. SQL tests independently cover real PostgreSQL guards/RLS. No physical phone was inspected. Ad-hoc Chrome attachment to the short-lived test server timed out; automated browser results and inspected local screenshots supply the UI evidence instead.

This fix protects the reproduced cross-event preflight failure. It does not resolve the older conflicting records, retroactively apply the reported merge, certify every possible failure path, or guarantee zero network latency. Publication and a fresh user-confirmed link attempt are still required on the installed application.
