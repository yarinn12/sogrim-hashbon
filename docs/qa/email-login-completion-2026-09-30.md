# Email login completion regression

## Failure and fix

After a successful password grant, the submit handler waited for user metadata,
workspace verification and the account snapshot. A temporary failure in those
steps rendered the credentials form again, even if a usable session had already
been stored. Reopening the app could then appear to fix the login.

The accepted session is now saved immediately and the verified session's workspace
metadata is activated synchronously. The form changes to a visible success/loading
phase. Account completion uses the existing startup recovery path, with automatic
retry and immediate retry on reconnect/foreground. The app stays covered until its
account-specific connection completes. An in-page sign-in retry cannot use the
cold-start local-cache shortcut: it must hydrate the app for the signed-in account
with one reload. A normal cold start retains its existing fast-resume behavior.

The existing awaited snapshot-save boundary remains intact. Invalid credentials
remain an error on the form; they never display success or persist a session.

## Before/after evidence

- Baseline: `d357f8f` on Windows, Chromium Android profile. Both new temporary
  failure scenarios (user lookup and workspace verification) failed. After a
  successful password grant the page showed the login form and
  `לא הצלחנו להתחבר כרגע.` instead of continuing automatically.
- The initial fix passed those cases. The added reconnect test then detected a
  separate anonymous-workspace write with an empty `currentParticipantId`.
  Activating the accepted account's workspace before asynchronous completion
  removed that incorrect write. No payload/identity assertion was relaxed.
- All five final focused Chromium Android cases passed: immediate progress,
  temporary user failure, temporary workspace failure, offline/reconnect with
  repeated wake-up events, and a held snapshot write acknowledgement.
- A wider run caught an intermittent false-empty event screen. It reproduced
  twice in six runs with the baseline auth module as well. The branding layer
  rewrote the account-loading/recovery message as a confirmed empty account.
  Both deterministic branding regressions failed before the guard was added.
  A separate deterministic test also caught startup marking a discarded cloud
  response as authoritative after a newer local save. The fix preserves the
  loading guard and schedules a fresh read without overwriting local edits.

The tests use the real application, form submit, storage, fetch and reload paths
with isolated synthetic Supabase responses. The cloud fixture only exposes the
account event under its matching workspace, checks every final write's account
identity and event preservation, and verifies one password grant, one reload and
the visible account event. The acknowledgement test blocks the actual write
response and requires the gate to remain locked until that response is released.

## Automated coverage

- `e2e/email-login-completion.spec.mjs` runs in the normal mobile QA matrix.
- `e2e/account-auth-feedback.spec.mjs` also verifies that rejected credentials
  produce neither a saved session nor an accepted-login heading.
- `tests/accountHydrationCompletion.test.mjs` executes the real hydration and
  branding functions with controlled completion ordering and DOM doubles.
  It checks loading/recovery copy, stale responses, newer local edits and a
  genuinely empty account. The existing browser hydration regression is retained.
- Existing source-test boundaries were updated for the recovery function's new
  optional parameter and the explicit sign-in reload condition; their behavioral
  assertions were preserved.
- `npm test`: 3,094 tests passed, no skips (including database integration tests).
- The final mobile run includes login completion, auth feedback and returning
  account event hydration on Android Chromium, iPhone/iPad WebKit, large text and
  narrow reflow. Full repository mobile and two-client suites run in PR CI.

These are browser simulations, not physical phone or live-user credential tests.
No production group/account data was edited. PWA release 503 invalidates the old
cached auth module. Native store publication is separate from the web deployment.
