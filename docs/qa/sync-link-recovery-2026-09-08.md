# Account-link and personal-receipt recovery — 8 September 2026

## Changes

Canonical event receipts now survive older receipt arrays. Authenticated canonical hydration and write retries apply committed guest-to-account links to offline event work before merging. This applies only to that event, retains removal clocks, does not create global identity deletions, and does not grant new links based on personal replicas. Existing SQL authorization remains the final authority.

Integrated the previously uncommitted personal-receipt fix from `QA_CONFIRMED_GROUP_PERSONAL_RECEIPT_2026-09-08.md`: an acknowledged shared write remains acknowledged when the separate personal workspace write fails. Only the personal backup remains pending. Console diagnostics serialize the existing non-sensitive codes, HTTP statuses and outcome fields so inspection does not reduce them to `Object`.

## Regression evidence

The new full client-to-PostgreSQL regression failed before the fix: an old receipt array erased the committed link from the final RPC payload, and a new offline expense retained the old guest payer. After the fix the actual RPC, including an injected CAS retry, succeeds; the receipt, new note and expense survive, a paid transfer keeps its ID, amount, paid timestamp and marking actor, and unrelated events retain their own guest.

The initial paid-history fixture used a marking actor different from the fixture's authenticated creator. The initial creation guard correctly rejected it. The fixture now seeds a payment by the authenticated party, with the same preservation assertions. No guard was disabled.

The independent Chromium/WebKit link test now includes a recipient's offline note before the link, reconnect, successful queue acknowledgement, and restart. The first extension waited for a nonexistent back button after saving a note; trace inspection identified the wrong navigation step. The corrected test uses the visible event participant control directly. All data, receipt, queue and page-error assertions remain.

- Focused real SQL scenarios: 3 passed. Paid-history extension: 1 passed.
- Full normal suite after release metadata completion: **2,749 passed**, zero failed/skipped.
- Full two-client suite: **8 passed**, zero unexpected writes or page errors. These use a synthetic backend and are not physical-phone or production-RLS evidence.
- An intermediate packaging check failed because the new version's release-note file had not yet been created. The file was added and the full suite rerun successfully.

Logs: `work/stale-link-client-red-root.log`, `work/stale-link-client-green-root.log`, `work/stale-link-client-paid-green-root.log`, `work/stale-link-browser-green-root.log`, `work/release-4.32-unit-final-root.log`, `work/release-4.32-sync-root.log`.

## Existing production conflicts

Read-only inspection still found three older events whose identity remapping is rejected: a locked taxi event (100 shekels), Spiderman (paid 16 shekels), and Lobby Tahel (80-shekel taxi, paid 20-shekel transfers). The amounts and payment states match between replicas; identity references differ. The user's confirmation of the Maor and Ariel identity mapping was requested separately. These records and all pending queues remain intact pending that answer. The current phone outbox has not been extracted; cloud personal replicas do not prove its exact contents.

The requested Korea/Liron link was already committed and independently verified in the prior task turn. This client release strengthens recovery but does not claim every historical pending item has been resolved or that transient offline queuing can never occur.
