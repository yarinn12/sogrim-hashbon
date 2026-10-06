# Event settings and durable self-leave

The client left the event optimistically, but the actual authenticated database RPC rejected its write with `42501: A membership update cannot change event content`. The membership guard did not allow the `participant-left` activity appended by the UI. Generic merge also inserted empty `deletedExpenses` / `activityLog` fields into sparse older snapshots, and resurrected an alias and duplicate-name pair when a member without financial history left.

The write boundary preserves absent empty defaults and removes only the departing member's stale identity references after merging. The incremental SQL migration permits one self-leave receipt, for the authenticated actor and subject, after the existing guard proves that only this active member is leaving and another active admin remains. Financial history, notes, profiles, settings, existing activity attribution and retention rules stay protected. A late leave acknowledgement also checks account/save ownership before changing the screen's notice.

Regression evidence:

- Before application/server changes, both actual-client-payload database tests failed at the real membership guard. The fixture uses the actual shared-event envelope; the generic state fixture's `deletedEvents: []` does not belong in this envelope.
- With empty-default preservation alone, the no-activity control passed and the UI's actual leave receipt still failed. With the guarded migration, both passed.
- The no-financial-history/alias scenario then failed before the post-merge identity cleanup and passed after it.
- The account-switch test failed before the UI ownership check: account B received account A's leave-success notice. The same test passes after the check.
- Nine successful database scenarios exercise the final RPC payload and acknowledgement, canonical membership removal, another authenticated client's fresh read, preserved expenses/transfers/notes, closed paid history, creator/admin handover, a full activity log, a real CAS conflict and offline recovery.
- Ten negative database scenarios retain authorization for forged/missing activity subjects, forged actors, unrelated/extra activity, expense/currency/note edits, another member's removal and edits to old activity. They assert the rejected transaction leaves the canonical snapshot unchanged.
- Incremental installation and idempotent migration verification pass 191 database tests, with actual triggers/RLS enabled and synthetic users only.
- Focused domain, store, save-reliability, rollback, reconciliation and database tests passed (326 in the recorded focused run). The complete normal suite passed 3,199 of 3,200; the remaining private-directory-junction test could not create a Windows junction (`EPERM`) in the sandbox. No assertion was weakened or skipped. The subsequently added migration reapplication test passes in the 191-test database run.
- Seven settings browser scenarios run in both Android Chromium and iPhone WebKit: scrolling/focus, delete/reload, sole-manager leave restriction, activity history, cover upload/removal/reload, management/currency/repayment/rounding/lock/unlock/reload, and account-lock handling.
- Five independent-client scenarios pass: Android/iPhone leave and reload, Android/iPhone offline restart and recovery, and three consecutive server rejections followed by one successful retry. Cancellation, member/admin permissions, financial history, a single leave receipt and absence after reload are asserted.

Browser tests use the real UI/store with intercepted synthetic cloud traffic, not production PostgreSQL. The separate database tests use PGlite's PostgreSQL engine and the actual schema/RPC/roles. These are not physical-device or live-production verification.

Local browser setup required an explicit existing `PLAYWRIGHT_BROWSERS_PATH`, writable `TMP`/`TEMP`, and permission to reach localhost. The Windows sandbox's shell-based Playwright web-server teardown hung after completing tests; a task-only runner reused a directly managed local server, and the browser suites then exited normally. Application code/test assertions were unchanged by this runner.

The added cover-removal locator is scoped to the settings card: the underlying event header renders a second button with the same action. The initial unscoped locator failed Playwright's strict locator check before clicking; scoping it preserves all save/reload assertions.

Repeat locally or in GitHub QA:

```text
npm test
node --test tests/databaseIntegrity.test.mjs tests/sharedEventStore.test.mjs tests/settingsSaveReliability.test.mjs tests/settingsSaveRollback.test.mjs tests/appActions.test.mjs tests/sharedSaveReconciliation.test.mjs
npx playwright test e2e/event-settings-flow.spec.mjs --project=android-mobile --project=iphone-webkit
npx playwright test --config playwright.sync.config.mjs --grep self-leave
```

Release status: staged for the next update. No live migration, production deployment or Google Play upload was performed. Apply and verify `20261003090000_allow_guarded_self_leave_receipt.sql` with the next release, then rebuild the native bundle from the merged source. The earlier signed 4.55/185 bundle does not include this patch.

```text
node scripts/apply-guarded-self-leave.mjs --dry-run
node scripts/apply-guarded-self-leave.mjs --apply
node scripts/apply-guarded-self-leave.mjs
```

Those commands require the configured private database URL. The last command only verifies installation. Before publication, check leaving a synthetic shared event on two real installed devices, reload both, and verify the departed account needs a fresh invitation to rejoin. The covered regressions do not prove that every possible settings/sync scenario is bug-free.
