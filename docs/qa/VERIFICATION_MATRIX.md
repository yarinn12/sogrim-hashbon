# Verification and release evidence

This is the maintained coverage map, not a declaration that every line or every
device has been verified. Record each run's results separately, against its
source fingerprint. Never combine results from different revisions as if they
were one run.

## Why passing tests can miss user-visible faults

- Source-contract assertions verify that guards or SQL definitions exist; they
  do not execute a browser or database transaction.
- A mocked HTTP response does not execute Supabase RLS, triggers or replication.
- One client cannot establish that an independent account receives a change.
- A retry that passes can hide a timing-dependent failure.
- Browser device profiles do not run the installed Android/iOS package, native
  authentication, OS suspension, software keyboards or remote push delivery.

Keep these layers distinct. A missing live/device check is **unverified**, not
passed. A known intermittent failure remains open until reproduced and fixed
or otherwise explained with evidence.

## Coverage map

Paths below are repository-relative. They identify relevant maintained tests,
not an assertion that every scenario in each area has been audited manually.

| Area / invariant | Executable local coverage | Remaining release evidence |
|---|---|---|
| Startup, first use, durable local state | `first-use-journey`, `startup-splash`, `platform-compatibility` (e2e); `appBootShell`, `stateStore`, `localIdentity` (unit) | Cold start of the exact signed packages, low-memory restart |
| Account recovery and account isolation | `account-auth-feedback`, `iphone-google-session`, `iphone-session-history` (e2e); `accountSessionResume`, `cloudAuthRetry`, `personalWorkspaceWriteRace` (unit) | Real Google/Apple redirects in installed packages; confirmed test accounts |
| Create event and redeem invitation | `event-creation-save`, `join-event-resilience` (e2e); `invitationPublicationOrdering`, `eventInvites` (unit); actual invite transaction cases in `databaseIntegrity` | Real shared link opens the correct app and account, with the deployed schema |
| Note create/edit/delete and peer delivery | `e2e-sync/two-client.spec.mjs`; `save-feedback`, `note-validation-focus` (e2e); `noteFieldMerge`, `sharedSyncPartialFailure` (unit) | Same journey between two approved accounts on two real devices |
| Atomic canonical/personal note copies | Actual PostgreSQL RPC, triggers and role tests in `databaseIntegrity`; `canonicalPersonalNoteProjection` also contains source-contract checks | Confirm applied production schema, not just local schema text |
| Offline work, retry, partial writes, stale responses | `save-feedback`, `egress-cache-sync`, `received-expense-native-resume` (e2e); `offlineSyncResilience`, `workspaceRebaseDurability`, `sharedWriteVersionRace` (unit) | Airplane mode, OS kill/reopen, real network switching; never clear pending work to make a test pass |
| Expenses and settlement amounts | `financial-calculation-journey`, `expense-edit-payer-difference`, `paid-transfer-remainder` (e2e); `settlementDeepAudit`, `domain` (unit); two-client expense journey | Peer visibility and payment flow in installed packages |
| Close event and payment authority | `close-event-resilience`, `direct-repayment-mode` (e2e); real authenticated payment/closed-event RPC tests in `databaseIntegrity` | Real authorized sender/recipient/admin flows; no external money transfer in QA |
| Reminder and notification order | `payment-reminder-iphone`, `profile-notifications` (e2e); `paymentReminderRecovery`, `eventActivityNotifications`, `invitationPublicationOrdering` (unit) | OS push receipt, deep-link opening, permissions and throttling on physical devices |
| Settings, identity, friends, profile | `event-settings-flow`, `profile-save-concurrency`, `friend-identity-journey` (e2e); `settingsSaveRollback`, `profileSaveConcurrency`, `friendsStore` (unit); two-client owner settings | Remote account updates and image upload in real infrastructure |
| Focus, scroll, touch hit areas, accessibility | `design-bug-regressions`, `dialog-return-interaction`, `mobile-layout`, `accessibility-center` (e2e); `expenseEntryScrollOwnership`, `dialogActivationFocus` (VM) | Physical keyboard/viewport behavior and OS font scales |
| Animation and lifecycle | `app-motion-system`, `motion-lifecycle`, `mutation-observer-lifecycle`, `scroll-intent` (e2e) | Low-end device frame pacing, reduced-motion system preference |
| PWA cache and updates | `pwa-fresh-install`, `pwa-update-recovery` (e2e); `serviceWorkerRuntime` (unit) | Upgrade the exact older installed release while retaining an outbox |
| Capacity and traffic | `npm run qa:capacity`, `npm run qa:sync-egress` (local synthetic data) | Staging/production latency, quotas and provider load with explicit scope |
| Server and authorization boundaries | `serverEventInvites`, `serverStateIsolation`, `serverStaticSecurity` (unit/integration); role/RPC tests in `databaseIntegrity` | Deployed configuration and independent security review; this map is not a full security audit |

## Permanent local/CI lanes

1. `npm test`: syntax checks and all discovered Node tests, including actual
   PostgreSQL/PGlite behavior. Some other tests are source or VM contracts.
2. `npm run qa:capacity`: data-size and concurrent-edit simulations.
3. `npm run qa:mobile`: browser device matrix. Inspect skips, runtime errors,
   screenshot evidence and first-failure traces, not just the summary count.
4. `npm run qa:sync`: **two independently launched browser engines**, separate
   identities, cookies, caches and storage. Five journeys cover note CRUD,
   offline recovery, durable outbox after page restart, concurrent field edits/CAS conflict, settings, expense
   publication and closure. The backend is a synthetic identity-scoped CAS
   fixture; it does not claim to implement real RLS/triggers/push.

CI runs the device profiles as independent jobs and keeps the existing
`unit-and-mobile` required-check name as an aggregate. Every lane must succeed.
`failOnFlakyTests` makes a failed-first/passed-retry case fail the QA workflow.
CI also rejects `test.only`, so a temporary focused test cannot silently
replace the full matrix.
First-failure traces and per-lane reports are retained. A local configuration
check is not proof that the GitHub workflow has executed.
Use `--list --reporter=list` when only listing tests, so discovery does not
overwrite the HTML/JSON result files from an executed run.

**Do not run `qa:release:core` as a safe local shortcut.** It includes live
account/data operations. Use confirmed QA identities and the live-write safety
controls before invoking any `*-live` script.

## Measurement rules

- Measure from the initiating UI action to actual peer UI/data visibility;
  distinguish local acknowledgement, canonical commit, personal index and push.
- The two-client fixture has 5-second ordinary-delivery and 8-second reconnect
  expectations; measured times include automation overhead, not a real network.
- Active-event and home polling have different intervals. Existing home refresh
  is about 15 seconds; notification fallback polling about 12 seconds. Do not
  promise immediate sync everywhere or silently increase traffic/cost.
- The `iphone-large-text` metadata currently activates Dynamic Type only where
  the spec explicitly uses the local preview parameter (`mobile-layout`).
  Other specs under that project name alone do **not** prove enlarged text.
  `reflow-200` is a narrow 320-CSS-pixel viewport, not actual OS/browser zoom.
- An actual offline/outbox failure must remain visible. Suppressing a warning
  is not evidence of synchronization.

## Before public release

- Select one candidate revision; run all local/CI lanes on that revision.
- Resolve unexplained intermittent failures; preserve failing traces.
- Verify deployed schema/configuration and real two-account writes using
  approved synthetic data. No arbitrary personal accounts or groups.
- Verify the exact Android/iOS signed artifact and previous-version upgrade.
- Record real network/offline/resume, auth and push results, with device/build
  versions. WebKit emulation is not an iPhone certification.
- Publish only after explicit authorization; local green checks do not update
  Google Play, TestFlight or Vercel.
