# Launch readiness status - 2026-08-13

## Verified today

- 1,032 unit and integration tests pass.
- All 24 mobile journeys pass on Android, iPhone WebKit, enlarged iPhone text and 200% reflow. A repeated 48-test stability run also passes without intermittent failures.
- A complete native Android 16 journey passes from first event creation through expense entry, participants, sharing, settings, settlement, notifications, profile, friends and cleanup.
- Native Android enlarged-text checks pass at a 1.5 system font scale with no clipped text, horizontal overflow or undersized controls.
- Ten cold-start samples all reach an interactive screen. Median startup is 1.75 seconds, P75 is 1.79 seconds and the slowest sample is 2.65 seconds, within the 3-second product target.
- The Android journey now enforces at least 12px between the final settlement content and the fixed navigation. The measured clearance is 98px on the Android 16 QA device.
- Full-screen participant routes now expose a visible, tested back control instead of trapping the user without the product header or bottom navigation.
- Live account memory, two-account event sync, invitation joining, friendship, notifications and feedback privacy checks pass against Supabase.
- Data calculations complete for 5,000 expenses, and a 1,000-expense event opens and settles in the UI benchmark.
- Android release `3.47` (`versionCode 70`) is signed, source-matched and available as a verified AAB. Its SHA-256 is `DA275414D1AF2706BA1621082D14BEEF419B228CC924186CB9C3E31D69A679BE`.
- Google Play Console currently serves release `3.46` (`versionCode 69`) to the closed-test track at a 100% rollout. Release `3.47` remains the verified production candidate until the 14-day access gate opens.
- Android target API 36, App Links, Play signing association, Firebase push, store artwork and legal pages pass the local release gate.
- The provider-portable Docker runtime builds and answers `/api/health` in GitHub Actions.
- The backup server image is published to GitHub Container Registry on every push to `main`.
- A Render Blueprint now defines a free Frankfurt Docker recovery host with health checks and secret placeholders. The free service sleeps after inactivity, so it can validate recovery but does not qualify as an always-on failover host.
- GitHub Actions use the current Node 24-compatible checkout, setup, script and artifact actions, removing the previous Node 20 runtime warnings.
- AdMob is integrated on Android with consent before SDK initialization, non-personalized requests and one adaptive banner limited to Home and Friends. Production ad serving remains remotely disabled.
- The AdMob payment profile, European-regulations message, production application ID and public `app-ads.txt` are prepared. Store linkage and app-readiness review remain intentionally pending until the Play listing is public.
- Google Play Billing and the `com.android.vending.BILLING` permission are excluded from the first release; referral-based ad-free access does not require a purchase SDK.

## External blockers before a full public launch

1. Vercel currently blocks new deployments because the team exceeded its fair-use limit. The live deployment still serves the app and APIs, but the prepared static CDN fix cannot be promoted yet.
2. The public app shell and private invite shell are still origin-backed. Eight production boundaries pass, while the strict CDN gate intentionally fails these two boundaries.
3. An always-on second server host is not active. The free Render recovery host can provide a manually warmed recovery path after its production secrets and invite journey are verified, but it does not meet the instant-failover requirement.
4. Public links still use the provider-owned `sogrim-hashbon.vercel.app` host. A stable custom domain should be purchased from an independent registrar and placed in front of both hosts.
5. After the 14-day gate opens, upload release 70, run the Play pre-launch report and complete one smoke pass from the Play-delivered build before staged Production rollout.
6. Apple submission remains blocked by Apple Developer enrollment, Sign in with Apple, the Apple Team ID association and a signed Xcode 26+ archive from macOS. The latest Apple Developer email received on 2026-08-12 says the enrollment was withdrawn, so there is no active membership to build against yet.

## Release rule

Do not call the product fully launch-ready until the strict production check passes, a rollback/failover host is live, and one staged Android installation completes sign-in, invitation, expense, settlement, notification and account-deletion smoke tests on a real device.
