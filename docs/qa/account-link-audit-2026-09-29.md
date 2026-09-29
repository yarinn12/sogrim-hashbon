# Account linking and expense drafts — 2026-09-29

Baseline: `24b0950`, integrating current main (`db5e592`, release 4.51) with the existing cross-user synchronization fixes in PR #18. All identities and financial records used in these tests are synthetic.

## Confirmed failure

An expense draft retained an offline participant ID after that participant was linked to an account in the event. An open editor could no longer save. Restoring the draft filtered out the old payer and its amount; restaurant drafts silently substituted the current user as payer and individual consumer. The local link completion also removed the source from drafts instead of preserving its financial attribution.

The draft now follows the event's unique completed guest-to-account receipt before display, restoration and saving. Complete amounts assigned to both names are added in integer minor units into one payer row, allowing the wizard to continue. Shared participant selections are deduplicated and restaurant item ownership follows the same account. Unfinished input and concurrent-expense revision evidence are preserved.

A local link awaiting confirmation is excluded from draft redirection. Its original IDs and amounts remain recoverable, including after restarting or rejecting the link. A successful canonical receipt authorizes redirection. Events without a valid receipt, conflicting receipts, another event and inactive targets do not authorize this operation. No permissions, authentication settings or database guards were relaxed.

## Regression evidence

- Four behavioral reproductions failed before the fix: open/reopened standard split-payer drafts and open/reopened restaurant drafts. The restaurant reproduction observed a real final transport payload written with the wrong payer, not just an intermediate object.
- Four independent Android/Chromium and iPhone/WebKit reproductions failed before the fix because the restored payer was the wrong account. They passed after correction. The final browser scenarios additionally exercise two original payer rows, page restart, canonical receipt and delivery to the other user's independent storage.
- Twelve new normal-suite cases cover the four financial writes and receipts, pending confirmation, rejected links, late local completion, incomplete amounts, unchanged concurrency evidence and invalid/unrelated receipts. Four new two-client browser cases are retained in the automated suite.
- The integrated normal suite passes **3,079 tests, zero failures and zero skips**, including actual PostgreSQL/PGlite account-link permission, payment history, stale-replica and competing-link cases.
- An intermediate check exposed duplicate remapped payer rows blocking the wizard. The final tests exercise the actual wizard readiness check as well as final persisted amounts.
- Existing orchestration test harnesses now provide the new draft context dependency. Two source-string checks previously demanded destructive draft cleanup; they now demand confirmed event-scoped redirection, supplemented by behavioral confirmed/pending/rejected completion tests. No error recorder or financial assertion was removed.

## Scope and publication

The existing account-link audit also covers double submit, identity changes during preflight, unrelated pending events, offline/interrupted recovery, lost responses, account switching, membership, and conflicting links from two administrators. Final CI and browser results are recorded with the task's evidence report.

The browser suite uses independent browser engines and synthetic CAS endpoints; SQL integration executes the real schema and guards locally. These are not physical iPhone/Android tests or a live production account-link exercise. Regression tests protect the covered scenarios and cannot guarantee the absence of future bugs.

This account-link fix adds no database migration. PR #18 also contains the earlier participant-alias clock migration documented in `cross-user-sync-2026-09-09.md`; that migration must be applied and verified before releasing that combined change. This document does not claim publication to production or either app store.
