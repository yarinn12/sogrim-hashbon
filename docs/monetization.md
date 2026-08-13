# Monetization foundation

## Current product decision

- Paid Premium is postponed and remains disabled in runtime configuration.
- The only active ad-free path is the referral reward described below.
- Android build 70 (`3.47`) is ready to use Google's fixed test banner without
  enabling the production-ad switch.
- Production AdMob rollout stays at zero until consent, placement and entitlement behavior pass real-device testing.

## Referral reward

- Every account keeps its existing private friend code.
- Share links use the compact public path `/r/<code>`.
- The inviter receives 30 ad-free days after the invited account:
  - is no more than 14 days old when attribution is claimed;
  - confirms its email;
  - participates in an event with at least two people;
  - creates an expense or marks a transfer as paid within 30 days.
- An invited account can be attributed once.
- Self-referrals are rejected.
- Rewards are capped at 12 per rolling 365 days.
- Annual progress includes only rewards from the rolling 365-day window; lifetime reward totals remain available separately for future reporting.
- Pending referrals disappear from the "on the way" count after the 30-day qualification window.
- Active ad-free periods stack instead of overlapping.

Referral attribution and entitlement writes are available only through guarded
Supabase RPC functions. Clients have read-only RLS access to their own records.

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
6. Keep Google''s published European-regulations UMP message active in AdMob.
7. Add Hebrew localization in the AdMob message editor before production rollout; the currently published message contains English only.
8. Complete the AdMob payments profile only when production ad serving is intentionally approved. It remains incomplete now, so production units do not serve.

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

### Current readiness

- Native AdMob SDK and the production application ID are included.
- Runtime configuration currently keeps `ADMOB_ENABLED=false`,
  `ADMOB_TEST_MODE=true` and `ADMOB_ROLLOUT_PERCENT=0`.
- Build 70 can therefore request only Google's fixed Android test banner.
- Test banners remain limited to Home and Friends and still respect ad-free
  entitlements, consent, dialogs, keyboard focus, connectivity and app visibility.
- A signed build 70 AAB is prepared to pass the full project tests and Android release lint.
- Real ad serving remains blocked until the payment profile, Hebrew consent
  message and a physical-device test are complete.

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
