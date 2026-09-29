# Repayment method round-trip verification — 2026-09-29

The 4.51 fix is correct in both directions: an explicit repayment selection rebuilds pending routes, preserves paid receipts, and keeps the selected method's revision during reconciliation with older replicas.

## Permanent regression coverage

- The original fixture distinguishes four direct payments from two smart payments.
- 50 combinations (five currencies, five amounts, rounding on/off) each switch smart → direct → smart → direct. Every switch checks actual routes, exact net balances, unchanged expenses, render stability, stale reads, and repeated stale writes.
- Thirty rapid switches with a frozen wall clock verify increasing field revisions and resistance to all prior snapshots.
- Reselecting direct mode repairs a mismatched smart plan, complementing the existing inverse test.
- Partial and complete paid histories survive repeated switches in both directions.
- Concurrent payment marking and reversal survive either write order and subsequent stale replays.
- Rejected settings restore the prior method without overwriting a later selection.
- An unrelated newer cover-image edit cannot restore an old payment plan.
- Empty and fully balanced groups remain empty; switching method need not invent payments.
- Final-save tests cover concurrent expenses, conflict retries and acknowledgement gating in both directions.
- Real SQL integration tests cover direct and smart final payloads, same-mode reselection, persisted routes and unchanged expenses.
- Two independent Android Chromium/iPhone WebKit clients switch with an offline peer and an offline manager. Both clients reload after each method and assert visible payment rows and amounts, alongside canonical payloads.

These tests are included automatically by npm test and npm run qa:sync in the existing QA workflow. They detect the covered regression; they do not prove that every future change or every installed old client is bug-free.

## Evidence

The expanded 24-test round-trip file produces **13 failures and 11 passes** against an isolated pre-fix 4.49 source tree. Failures include the actual 2-versus-4 route count on the reverse switch, stale-plan revival, rapid switching and rollback. All 24 pass against 4.51.

The full updated unit/database suite passed **3,039 tests**, with zero failures or skips. The focused settlement/SQL suite passed **186 tests**. Both extended independent-client browser scenarios passed. All **30 mobile settings/repayment tests** passed across Android, iPhone, iPad, large text and narrow reflow profiles.

The balanced-event fixture includes the creator field used by real expenses, so expense-preservation assertions compare equivalent serialized records rather than treating a missing optional field versus undefined as a financial change.

## Korea: read-only production-data verification

At 12:38 UTC the canonical group had 39 expenses, four active members, smart mode, and three transfers. In memory, using that exact snapshot and the current application save/read merge functions:

| Choice | Transfers | Expenses |
| --- | ---: | ---: |
| Direct | 6 | 39 |
| Smart | 3 | 39 |
| Direct again | 6 | 39 |
| Smart again | 3 | 39 |

Each result was also merged with all four personal workspace snapshots and checked for matching expense contents and payment routes. The read-only transaction verified that production state and its timestamp were unchanged. This verifies stored data and application behavior; it is not observation of the four participants' physical devices.

The production web source and Android/iOS release 4.51 contain the existing fix. This follow-up adds tests only and does not require a new app binary.
