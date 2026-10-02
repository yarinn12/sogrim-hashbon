# Stable repayment plans — 2026-10-02

## Report and cause

The user reported that Korea's previously published smart transfer to Maor changed from ILS 998 to ILS 2,462 after repayment-setting changes. The requirement is to retain each method's first published plan while its financial inputs remain unchanged.

Every repayment-setting selection previously called reconciliation with `preservePendingRoutes: false`. The event retained only the currently selected plan. Returning to smart mode therefore generated a new greedy plan, even when the previously published alternative was financially valid. Earlier round-trip fixtures checked balanced totals and route counts but did not contain a different valid historical smart route.

## Behavior

- Remember pending transfers separately for smart and direct methods, including IDs, payer, recipient and amount.
- Adopt a valid compatible legacy published plan before switching methods. Restore the remembered plan after repeated selections, failed-setting rollback, canonical writes, retries, stale-replica merges and reloads.
- Bind each remembered plan to its actual financial inputs. Changed balances, rounding or payment receipts invalidate obsolete plans; current paid receipts and status history remain authoritative.
- Preserve the admin-owned canonical memory during member content saves. No SQL permission guard or authorization rule was relaxed.
- Precache the new module and advance the web release to 506.

## Regression evidence

`tests/repaymentRouteStability.test.mjs` uses synthetic identities and an alternative valid published smart plan. Its first transfer is 99,800 agorot; a fresh greedy plan changes that route to 246,200 agorot without changing expenses. This is a reproduction of the mechanism and reported amounts, not a reconstruction of Korea's historical complete plan.

Before the fix, all three initial behavioral regressions failed: same-mode reselection, smart/direct/smart restoration, and 30 switches through actual shared-event write and read merging. Each observed the 998-to-2,462 change. With the fix all seven focused cases pass, additionally covering rollback, changed expenses, actual paid transfers and corrupt remembered data.

Two PGlite SQL integration regressions exercise the actual authenticated compare-and-swap RPC, final payload and acknowledgement: exact plans survive conflict retries; member expense saves retain admin-owned memory and direct forged settings writes are rejected with 42501. The SQL fixture uses the actual admin `buildSharedEventState(mergeSharedEventWriteState(...))` envelope, rather than a raw personal-state envelope, because the unchanged metadata/settings guards correctly reject personal-only fields.

Local validation: `npm test` passed 3,169 tests with no failures; `npm run qa:capacity` passed all scale and contention gates. The normal suite includes the new regression and SQL tests, plus complete first-install offline module loading.

Independent Android-profile Chromium/iPhone-profile WebKit scenarios were added in both manager directions to `e2e-sync/two-client.spec.mjs`, covering settings UI, an offline peer, exact canonical and personal persisted routes, reloads and displayed amounts. Test discovery passes (74 synchronization tests total). Local browser execution is blocked before the browser starts by this workspace's `os.networkInterfaces()` failure (`uv_interface_addresses`, errno 1); no two-client browser pass is claimed here. The existing GitHub QA workflow runs the full synchronization and five-project mobile suites.

## Live restoration

The live app still displays its sign-in page after the secure authentication attempt. There is no authenticated Korea snapshot or historical full plan available in this workspace, and no production data has been changed. Restoring only the known 998 transfer would be insufficient: obtain the full original plan, reconcile it against current expenses and confirmed receipts, apply only valid pending transfers, and verify the final canonical acknowledgement and refresh on both devices. Never infer that a synthetic route is Korea's original route.
