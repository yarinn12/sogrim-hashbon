# Launch readiness status - 2026-08-12

## Verified today

- 1,028 unit and integration tests pass.
- 24 mobile journeys pass on Android, iPhone WebKit, enlarged iPhone text and 200% reflow.
- Live account memory, two-account event sync, invitation joining, friendship, notifications and feedback privacy checks pass against Supabase.
- Data calculations complete for 5,000 expenses, and a 1,000-expense event opens and settles in the UI benchmark.
- Android release `3.44` (`versionCode 67`) is signed, source-matched and available as a verified AAB.
- Android target API 36, App Links, Play signing association, Firebase push, store artwork and legal pages pass the local release gate.
- The provider-portable Docker runtime builds and answers `/api/health` in GitHub Actions.
- The backup server image is published to GitHub Container Registry on every push to `main`.

## External blockers before a full public launch

1. Vercel currently blocks new deployments because the team exceeded its fair-use limit. The live deployment still serves the app and APIs, but the prepared static CDN fix cannot be promoted yet.
2. The public app shell and private invite shell are still origin-backed. Eight production boundaries pass, while the strict CDN gate intentionally fails these two boundaries.
3. A second server host is not active. The container image is ready, but failover is not real until another provider runs it with production secrets.
4. Public links still use the provider-owned `sogrim-hashbon.vercel.app` host. A stable custom domain should be purchased from an independent registrar and placed in front of both hosts.
5. Do not upload the Android AAB until Google Play confirms that `versionCode 67` has not already been used.
6. Apple submission remains blocked by Apple Developer enrollment, Sign in with Apple, the Apple Team ID association and a signed Xcode 26+ archive from macOS.

## Release rule

Do not call the product fully launch-ready until the strict production check passes, a rollback/failover host is live, and one staged Android installation completes sign-in, invitation, expense, settlement, notification and account-deletion smoke tests on a real device.
