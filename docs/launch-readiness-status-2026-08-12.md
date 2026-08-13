# Launch readiness status - 2026-08-13

## Verified today

- 1,029 unit and integration tests pass.
- All 24 mobile journeys pass on Android, iPhone WebKit, enlarged iPhone text and 200% reflow. A repeated 48-test stability run also passes without intermittent failures.
- A complete native Android 16 journey passes from first event creation through expense entry, participants, sharing, settings, settlement, notifications, profile, friends and cleanup.
- Native Android enlarged-text checks pass at a 1.5 system font scale with no clipped text, horizontal overflow or undersized controls.
- Ten cold-start samples all reach an interactive screen. Median startup is 1.75 seconds, P75 is 1.79 seconds and the slowest sample is 2.65 seconds, within the 3-second product target.
- The Android journey now enforces at least 12px between the final settlement content and the fixed navigation. The measured clearance is 98px on the Android 16 QA device.
- Full-screen participant routes now expose a visible, tested back control instead of trapping the user without the product header or bottom navigation.
- Live account memory, two-account event sync, invitation joining, friendship, notifications and feedback privacy checks pass against Supabase.
- Data calculations complete for 5,000 expenses, and a 1,000-expense event opens and settles in the UI benchmark.
- Android release `3.45` (`versionCode 68`) is signed, source-matched and available as a verified AAB. Its SHA-256 is `9B8410D5C0B8BB3F6E08682FA1411E6ECC4A05454E4298ED74E89EAA1714611C`.
- Google Play Console accepted release `3.45` (`versionCode 68`) for the Alpha closed-test track at a 100% rollout on 2026-08-13. Its current console status is `under review`; release `3.44` (`versionCode 67`) remains the latest available tester build until Google completes that review.
- Android target API 36, App Links, Play signing association, Firebase push, store artwork and legal pages pass the local release gate.
- The provider-portable Docker runtime builds and answers `/api/health` in GitHub Actions.
- The backup server image is published to GitHub Container Registry on every push to `main`.
- A Render Blueprint now defines a free Frankfurt Docker recovery host with health checks and secret placeholders. The free service sleeps after inactivity, so it can validate recovery but does not qualify as an always-on failover host.
- GitHub Actions use the current Node 24-compatible checkout, setup, script and artifact actions, removing the previous Node 20 runtime warnings.

## External blockers before a full public launch

1. Vercel currently blocks new deployments because the team exceeded its fair-use limit. A fresh local production build succeeds, but a preview deployment was rejected by the same account-level block. The live deployment still serves the app and APIs, but the prepared static CDN fix cannot be promoted yet.
2. The public app shell and private invite shell are still origin-backed. Eight production boundaries pass, while the strict CDN gate intentionally fails these two boundaries.
3. An always-on second server host is not active. The free Render recovery host can provide a manually warmed recovery path after its production secrets and invite journey are verified, but it does not meet the instant-failover requirement.
4. Public links still use the provider-owned `sogrim-hashbon.vercel.app` host. A stable custom domain should be purchased from an independent registrar and placed in front of both hosts.
5. After Google approves release 68, install the Play-delivered build on a real Android device and complete one smoke pass before promoting it beyond the current testing audience.
6. Apple submission remains blocked by Apple Developer enrollment, Sign in with Apple, the Apple Team ID association and a signed Xcode 26+ archive from macOS. The latest Apple Developer email received on 2026-08-12 says the enrollment was withdrawn, so there is no active membership to build against yet.

## Release rule

Do not call the product fully launch-ready until the strict production check passes, a rollback/failover host is live, and one staged Android installation completes sign-in, invitation, expense, settlement, notification and account-deletion smoke tests on a real device.
