# Monetization foundation

## Current product decision

- Paid Premium is postponed and remains disabled in runtime configuration.
- The only active ad-free path is the referral reward described below.
- Android build 70 (`3.47`) contains a gate for Google's fixed test banner.
- Production AdMob rollout stays at zero until consent, placement and entitlement behavior pass real-device testing.

## Referral reward

- Every account keeps its existing private friend code.
- Share links use the compact public path `/r/<code>`.
- The inviter receives 30 ad-free days after the invited account:
  - claims the invitation within one hour of account creation and is not anonymous;
  - confirms its email;
  - is an active member of a shared event with at least one other active account;
  - creates an expense or marks a transfer as paid in that event within 30 days of claiming the invitation.
- An invited account can be attributed once.
- Self-referrals are rejected.
- Rewards are capped at 12 per rolling 365 days.
- Annual progress includes only rewards from the rolling 365-day window; lifetime reward totals remain available separately for future reporting.
- Pending referrals disappear from the "on the way" count after the 30-day qualification window.
- Active ad-free periods stack instead of overlapping.

Referral attribution and entitlement writes are available only through guarded
Supabase RPC functions. Clients have read-only RLS access to their own records.
The canonical shared-event write records qualifying activity in the database.
After email confirmation, the invited account's status request settles a pending
reward from that durable activity, including when it resumes on another device.

## AdMob

Ads are disabled by default. The Android project contains the production AdMob
application ID, but the SDK cannot serve a banner until runtime configuration
explicitly enables it.

Production requires:

1. Configure `ADMOB_ANDROID_BANNER_ID` with the real banner unit ID.
2. Set `ADMOB_MIN_ANDROID_BUILD` to the first app build that contains the
   controlled rollout gate.
3. Keep `ADMOB_ROLLOUT_PERCENT=0`, `ADMOB_ENABLED=false` and
   `ADMOB_TEST_MODE=true` for the internal Android test.
4. Confirm entitlement, consent, navigation clearance and ad removal behavior.
5. Set `ADMOB_TEST_MODE=false`, then enable production ads gradually with
   `ADMOB_ENABLED=true` and rollout percentages such as 5, 10, 25, 50 and 100.
6. Keep Google's published European-regulations UMP message active in AdMob.
7. Keep English as the UMP message language. The AdMob editor currently does
   not offer Hebrew as either a default or additional language.
8. Link the AdMob app to its Google Play listing as soon as the production
   listing is publicly searchable, then wait for Google's app-readiness review.

The app requests non-personalized ads and allows a banner only on Home and
Friends. Event details, expenses, settlements, profile/auth screens and open
dialogs never qualify for an ad placement. App-open and interstitial ads are not
used. Ads also fail closed while entitlement status is loading or unavailable,
so an eligible ad-free account never receives a temporary banner.

Consent is held in one client lifecycle state. A required UMP form is requested
only once per app session, concurrent requests share the same promise, and a
declined or unavailable form is not reopened after every render. The banner is
removed while the app is offline, hidden, showing a dialog or accepting text.
Android profile settings expose "העדפות פרסום" when Google's privacy-options
form is required; otherwise that action falls back to the public privacy policy.

For an app-version-safe internal rollout, production can keep
`ADMOB_ENABLED=false` with `ADMOB_TEST_MODE=true`. Only app versions containing
the test-mode client gate requests Google's official Android fixed-size demo banner
(`ca-app-pub-3940256099942544/6300978111`); older installed builds continue
without ads. The server checks the Android build before returning either the
   test or production switch. Production rollout is then assigned deterministically
per signed-in account, so the same account does not move in and out of a cohort.
Set `ADMOB_ENABLED=true` and `ADMOB_TEST_MODE=false` only after the updated build
and consent flow pass internal testing.

### Readiness checked on 2026-10-07

- Native AdMob SDK and the production application ID are included.
- The repository's Render blueprint sets `ADMOB_ENABLED=false`,
  `ADMOB_TEST_MODE=true` and `ADMOB_ROLLOUT_PERCENT=0`. The public deployed
  config queried as Android build 70 returned `adsEnabled=false`,
  `testMode=false`, `rolloutPercent=0` and the configured production banner
  unit `ca-app-pub-8171715888836308/9379516743`. Neither test nor production
  banners are currently requested by that deployed configuration.
- Build 70 can request Google's fixed Android test banner only when the
  deployed test-mode switch is enabled.
- Test banners remain limited to Home and Friends and still respect ad-free
  entitlements, consent, dialogs, keyboard focus, connectivity and app visibility.
- Earlier project notes report a prepared signed build 70 AAB, a completed
  AdMob payment profile, a published European-regulations UMP message and no
  policy-center issues. These account and artifact states were not verified
  during this audit.
- `app-ads.txt` is publicly available from the recovery origin and contains the
  production publisher ID.
- Real ad serving requires production switches, a linked public Play listing,
  a completed AdMob app-readiness review and a physical-device test. The
  AdMob/Play account states still need to be checked in their consoles.

## Subscription foundation

Google Play Billing and Apple IAP must be verified on a trusted backend. The
client sends a purchase token to that backend, but it never writes an
entitlement. After provider verification, the backend hashes the token with
SHA-256 and calls the service-role-only `record_verified_subscription` RPC.

The RPC:

- stores only the token fingerprint in `subscription_purchases`;
- prevents the same provider purchase from moving between user accounts;
- atomically creates, updates or removes the matching `ad_free` entitlement;
- keeps cancelled subscriptions ad-free until their verified term expires;
- removes access for expired, paused or revoked purchases;
- never exposes purchase records or write access to `anon` or `authenticated`.

The next billing phase is to configure the products in Google Play and Apple,
verify purchases and renewal notifications in a Vercel backend, then add the
native purchase and restore controls. A client receipt or local flag alone must
never activate Premium.
