# Notification audit and recovery — 2026-10-06

Release remains deferred to the next update. This work extends draft PR #38; it does not deploy a server, migrate the live database or replace the Google Play build.

## Live observations, read only

The public primary API reports `pushDeliveryReady: true`, the authenticated activity route rejects an unauthenticated request with HTTP 401, and the operator database connection was verified against the current public application's project before opening a read-only transaction. The audit exports aggregate counts and timestamps only, never account identities, device tokens or credentials.

- Six enabled Android registrations belong to four accounts; five registrations allow event updates. The newest device registration is from October 6.
- No activity notification reservation or inbox item was created in the preceding 14 days, although canonical shared events contain eight new-expense and two closure activity receipts in that period.
- The current canonical verification RPC authorizes all 26 candidate recipient pairs for those expenses; four pairs also have an enabled device allowing event updates. Closure receipts have seven currently authorized recipient pairs, with no enabled push devices for those pairs. These are pair counts, not distinct users or proof of permission at the historical activity time.
- The required registration, reservation and canonical permission RPCs exist. Recent account replicas mostly contain both shared identifiers and legacy credentials, so missing legacy credentials are not established as the general cause.
- The previously built Android 4.55/build 185 artifact includes `POST_NOTIFICATIONS` and the Firebase messaging service through merged SDK manifests. A missing permission declaration was ruled out.

This establishes a real notification-generation gap. It does not establish which particular failure caused the user's phone to receive nothing. A readiness flag confirms configuration presence, not successful Firebase delivery. Deployment log access through the available Vercel connector was denied with HTTP 403; no phone or emulator is connected, and local operator settings do not contain Firebase credentials. No real FCM delivery or receipt on the user's installed app was verified.

## Reproduced defects and changes

1. The expense/closure follow-up made one request and swallowed its failure. It also skipped an accepted offline financial save whose completion remained local and pending. The new normal regression fails on the old code because no notification intent exists after a committed expense receives a retryable HTTP 503.
2. Failed database reads for canonical permission, state, devices or reservation were interpreted as missing data. A canonical verification HTTP 503 reproduced an empty HTTP 200 rather than a retryable failure. Transport failure now fails closed and remains retryable; a verified `false` permission result still suppresses delivery.
3. A rejected inbox write could still consume the reservation and send push. A new regression reproduced this with an inbox HTTP 503. Before any FCM request starts, failed inbox writes now release reserved entries and report a retryable failure. The existing bounded deadline and cleanup tests remain intact.
4. A repeated request after a completed delivery received `ok: false` as though no eligible recipient existed. The new regression reproduces that response. The server now reads the exact sender/recipient/activity receipt, acknowledges completed deliveries and idempotently preserves their inbox item without another FCM request. A still-reserved receipt stays retryable; a suppressed push repairs its inbox row without sending push.

The activity outbox stores only owner, event, activity and kind identifiers, queue time and whether the originating save was confirmed. It records an accepted durable financial save before awaiting a slow cloud completion. The existing startup, reconnect, native resume and capped recovery timer flush the financial outbox before following up. A pending write for the same event blocks its notification; a pending write for an unrelated event does not block a healthy event. An already emptied financial outbox is also valid: the server still independently verifies the committed activity and canonical permission.

Requests and acknowledgements remain scoped to the originating account and session generation. A late response cannot erase another account's queue. Retryable network/auth/provider errors retain the entry; acknowledged or explicitly disallowed activities clear only their own entry. Overlapping workers share the in-flight request. Storage failure is reported through operation telemetry and does not block the immediate server attempt. The new module is part of the essential service-worker cache.

Notification opt-in and OS permission remain explicit. This patch does not enable notifications against a saved preference. Server delivery uses current canonical membership, does not notify the actor about their own expense and respects the recipient's event-update preference and expense push cooldown. Provider response loss remains an in-app-only completion, preserving the existing policy against ambiguous duplicate push attempts.

## Regression evidence and verification

- Before: one durable-retention regression and three server regressions fail for their exact notification-loss/acknowledgement assertions. An initial non-async fetch fixture was corrected to implement fetch's Promise contract before recording the canonical-read failure; no application assertion was weakened.
- After: 207 focused notification, account recovery, reminder, broadcast, native preference and invitation-ordering checks pass, with zero skips. The existing foreground-completion source assertion also passes unchanged: notification publication still awaits `completedSaveResult(saveRequest)`.
- Eleven new normal unit/integration checks cover retention and retry, offline financial acknowledgement, reload and account ownership, denied financial save, independent queue entries, in-flight coalescing, an already emptied financial outbox, the three server defects and real SQL deduplication/privileges.
- Four new independent Android Chromium / iPhone WebKit scenarios create an expense through the UI, inspect its committed canonical data and outgoing activity ID, restart the sender, recover from either delivery failure or an offline financial save, and display exactly one notification in the other account. All four pass. Their HTTP backend is synthetic; they do not certify live RLS or native push.
- The real PGlite test runs the installed schema, canonical permission RPC, reservation RPC, inbox insert/upsert and delivery status writes. It confirms one durable row per recipient after retry and actual PostgreSQL denial of an authenticated caller reserving delivery. Only host Auth and account-workspace HTTP reads are fixture shims; no notification SQL permission is bypassed or weakened.
- The native web bundle builds successfully with the current public configuration. No new APK/AAB is signed or uploaded.

The final normal-suite and mobile-profile logs, source tree and GitHub CI status are recorded in the task's evidence directory and PR. The Windows sandbox prevents one existing directory-junction test with `EPERM`; it stays enabled for CI. These checks cover the tested failures and are not proof that every notification defect is absent.

## Real-device follow-up for the next release

Use two isolated QA accounts in a shared event. On the recipient Android phone, explicitly enable notifications in Profile and grant the OS permission. Close the app, add an expense from the other account and verify both system push and the in-app inbox; tap the push and confirm the event destination. Repeat with a closure and a payment reminder, then offline/reconnect/restart and account switching. Confirm the actor is not self-notified, no duplicate inbox row appears, and disabling notifications/signing out prevents system delivery to that session. Record actual receipt and installed build numbers before claiming the user's phone is fixed.

Primary references: [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission), [Capacitor Push Notifications API](https://capacitorjs.com/docs/apis/push-notifications), [Firebase Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started).
