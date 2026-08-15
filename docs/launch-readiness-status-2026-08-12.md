# Launch readiness status - 2026-08-15

## Verified today

- 1,065 unit and integration tests pass.
- All 36 mobile journeys pass across Android, iPhone WebKit, enlarged iPhone text and 200% reflow. One enlarged-text disclosure interaction was rerun in isolation after a transient timeout and passed.
- The accessibility center is available before sign-in and on every primary app screen. Text sizing, high contrast and reduced motion persist across a native Android restart, remain available offline and support browser, Escape and native-back dismissal.
- Native AdMob banners are removed while the accessibility center is open and restored after it closes, so the fixed accessibility actions remain reachable.
- A complete native Android 16 journey passes from first event creation through expense entry, participants, sharing, settings, settlement, notifications, profile, friends and cleanup.
- Native Android enlarged-text checks pass at a 1.5 system font scale with no clipped text, horizontal overflow or undersized controls.
- Ten cold-start samples all reach an interactive screen. Median startup is 1.75 seconds, P75 is 1.79 seconds and the slowest sample is 2.65 seconds, within the 3-second product target.
- The Android journey now enforces at least 12px between the final settlement content and the fixed navigation. The measured clearance is 98px on the Android 16 QA device.
- Full-screen participant routes now expose a visible, tested back control instead of trapping the user without the product header or bottom navigation.
- Live account memory, two-account event sync, invitation joining, friendship, notifications and feedback privacy checks pass against Supabase.
- Data calculations complete for 5,000 expenses. On 2026-08-15, a 1,000-expense, 50-participant event opened in 299.1 ms and reached settlement in 613.8 ms in the UI benchmark.
- Android release `3.48` (`versionCode 71`) is signed, source-matched and available as a verified AAB. Its SHA-256 is `10BDBF01D6C7FE36154A6228F60CAF5E68DA1A43D4F38153CCF2632A07CEE893`; the clean build completed on 2026-08-15 and includes 539 fingerprinted source files.
- Release `3.47` was uploaded to the closed-test track and submitted to Google review on 2026-08-13. Google Play currently reports the update as `In review` while release `3.46` remains available to testers.
- Google Play reports 12 opted-in testers and 10 consecutive closed-test days as of 2026-08-13, leaving 4 days before production access can be requested.
- The Play Ads declaration now states that the app contains ads. Data Safety now declares the AdMob SDK's approximate location, app interactions, diagnostics and device identifiers as collected and shared for advertising, analytics and fraud prevention. Both updates were submitted to Google for review on 2026-08-13.
- Play Vitals reports no user-perceived crashes or ANRs during the latest 28-day window ending 2026-08-13.
- Product telemetry contains no reported client errors in the latest 14-day window. One isolated `state_load` operation failure was received from an unversioned web session without a matching `app_ready` event; it is not evidence of an Android 3.47 regression, but remains recorded for follow-up.
- The signed `3.47 (70)` release APK installs and opens on the Android 16 emulator. Android reports a 1.963-second native cold activity launch, the account screen renders correctly, warm resume returns to the same activity and verified App Links remain active. Release WebView inspection is disabled as expected, so DOM-level startup timing remains measured on the QA build.
- Android target API 36, App Links, Play signing association, Firebase push, store artwork and legal pages pass the local release gate.
- The Android-specific store gate passes against the developer website configured in Google Play, including the live legal pages, `app-ads.txt`, Android App Links, Google sign-in and Firebase push. The cross-platform store gate remains incomplete only because the Apple enrollment and iOS signing work are separate and unfinished.
- Google Play confirms that the developer account and `com.sogrimhashbon.app` satisfy the Android developer-verification requirement.
- The provider-portable Docker runtime builds and answers `/api/health` in GitHub Actions.
- The backup server image is published to GitHub Container Registry on every push to `main`.
- A Render Blueprint now defines a free Frankfurt Docker recovery host with health checks and secret placeholders. The free service sleeps after inactivity, so it can validate recovery but does not qualify as an always-on failover host.
- The recovery origin passes all 10 strict production boundaries. Its app shell, privacy, terms, support, accessibility, account-deletion, App Links and `app-ads.txt` endpoints all return `200` over HTTPS.
- Production monitoring now opens an incident only for an operational outage. The stricter CDN/cache contract remains recorded as advisory diagnostics until Vercel can accept the prepared deployment fix.
- GitHub Actions use the current Node 24-compatible checkout, setup, script and artifact actions, removing the previous Node 20 runtime warnings.
- AdMob is integrated on Android with consent before SDK initialization, non-personalized requests and one adaptive banner limited to Home and Friends. Production ad serving remains remotely disabled.
- The AdMob payment profile, European-regulations message, production application ID and public `app-ads.txt` are prepared. Store linkage and app-readiness review remain intentionally pending until the Play listing is public.
- The Google Play developer website now points to `https://sogrim-hashbon-recovery.onrender.com`, whose root exposes the verified AdMob publisher record. The change was published on 2026-08-13.
- Google Play Billing and the `com.android.vending.BILLING` permission are excluded from the first release; referral-based ad-free access does not require a purchase SDK.

## External blockers before a full public launch

1. Vercel currently blocks new deployments because the team exceeded its fair-use limit. The live deployment still serves the app and APIs, but the prepared static CDN fix cannot be promoted yet.
2. The public app shell and private invite shell are still origin-backed. Eight production boundaries pass, while the strict CDN gate intentionally fails these two boundaries.
3. An always-on second server host is not active. The free Render recovery host can provide a manually warmed recovery path after its production secrets and invite journey are verified, but it does not meet the instant-failover requirement.
4. Public links still use the provider-owned `sogrim-hashbon.vercel.app` host. A stable custom domain should be purchased from an independent registrar and placed in front of both hosts.
5. After the remaining 4 closed-test days, request Production access, wait for release 70 and its pre-launch report to clear review, then complete one smoke pass from the Play-delivered build before staged Production rollout.
6. Apple submission remains blocked by Apple Developer enrollment, Sign in with Apple, the Apple Team ID association and a signed Xcode 26+ archive from macOS. The latest Apple Developer email received on 2026-08-12 says the enrollment was withdrawn, so there is no active membership to build against yet.

## Release rule

Do not call the product fully launch-ready until the strict production check passes, a rollback/failover host is live, and one staged Android installation completes sign-in, invitation, expense, settlement, notification and account-deletion smoke tests on a real device.
