# Apple review preparation — 29 September 2026

## Confirmed review issue

Submission `8b6da79a-4738-4884-b744-c04959b104da` reviewed version **4.49 (178)** on an iPad Air 11-inch (M3). The supplied rejection identifies **Guideline 4.8, Login Services**: no equivalent privacy-preserving login option was found beside the third-party login.

The current provider-discovery implementation in 4.52 (181) could reproduce that screen: Apple starts hidden, and a settings request failure or 2.5-second timeout kept Apple hidden while Google remained available. This is a reproduced failure path, not proof of the exact network conditions during Apple's review.

## Read-only production checks

- Public app configuration returned HTTP 200.
- Supabase settings returned HTTP 200 with Apple, Google and email providers enabled.
- Apple authorization returned HTTP 302 to `appleid.apple.com/auth/authorize`, using Services ID `com.sogrimhashbon.app.web` and only `email name` scopes.
- These checks do not complete user authorization or prove that the authorization-code exchange and return to an iPhone/iPad work.

## Verification completed locally

- `npm test`: **3,086 tests passed**, zero failed, cancelled or skipped; includes the normal syntax, unit and database integration suite.
- Provider-discovery regression: the original implementation failed nine behavioral cases; the fixed implementation passed all 13 cases. Two Android/web controls passed on the original code and remain covered.
- `npm run qa:ios:providers`: all nine live public-provider checks passed, without authenticating a user.
- Six new iPhone/iPad WebKit scenarios are registered in the normal mobile suite. Local execution is blocked by unavailable browser binaries: package-system dependencies could not be installed in this environment and the browser download did not produce a valid archive. The TestFlight workflow runs these scenarios and the nearby auth suites before archiving/uploading, and saves screenshots/reports.
- Candidate source targets **4.53 (183)**. This is prepared source, not an uploaded binary or an App Review approval.

## Current continuation blocker

Automatic approval review rejected the attempt to push this feature branch to `https://github.com/yarinn12/sogrim-hashbon`, stating that explicit authorization to export the source/release changes to that destination was missing. No alternate upload or remote mutation was attempted. Obtain explicit user approval to push this branch and run the candidate TestFlight build. The reply to Apple remains a draft.

Update at 17:59 Israel time: the user explicitly approved uploading the prepared fix to `yarinn12/sogrim-hashbon` and building/uploading 4.53 to TestFlight. The authorization blocker is resolved. App Review submission and the real-device Apple sign-in check remain separate pending steps.

## Candidate verification before resubmission

- [ ] Build and upload the corrected candidate; record its exact version/build and source commit.
- [ ] Install that build from TestFlight on an iPhone or iPad, signed out.
- [ ] Confirm Apple and Google are available together on the sign-in screen.
- [ ] Complete Sign in with Apple with **Hide My Email**, return to the app, and create/open an event.
- [ ] Close and reopen the app; confirm the same account and event remain.
- [ ] Sign out and sign in again with Apple; confirm the same account is restored.
- [ ] Capture the real candidate login screen for reviewer evidence; update store screenshots if they show the old login screen. Browser screenshots with mocked providers are QA evidence only and must not be uploaded as native store screenshots.
- [ ] Select the verified new build in App Store Connect, add the prepared review notes and send the prepared reply, then resubmit for review.

Prepared text: `apple-review-notes-en.txt` and `apple-guideline-48-reply-draft-en.txt`. No review reply or resubmission is implied by preparing these files.

## Integrated candidate

The final candidate includes current main `db4cb4679e63308942f41ccf12c299e8c6d15dd6`: the 4.52 account-link/synchronization fixes and PWA 502 presentation updates. Build **183** distinguishes this integrated candidate from the initial 182 workflow snapshot. The iOS workflow runs the complete unit/integration suite and focused WebKit auth checks again on the combined source before upload.
