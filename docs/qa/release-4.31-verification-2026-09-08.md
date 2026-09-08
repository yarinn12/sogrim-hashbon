# Release 4.31 verification

Candidate: Android 4.31 (159), PWA 479, iOS source metadata 4.31 (159).

## Changes and regression evidence

Account linking now prepares only its target shared event. Unrelated rejected or pending account-outbox writes cannot cancel it before the durable linking intent is created. The actual save still persists its outbox and requires canonical confirmation. See `account-link-pending-sibling-2026-09-08.md` for full before/after, SQL and two-client evidence. No production identity was manually merged and no pending financial intent was discarded.

The previous release's GitHub iPhone lane also exposed a profile-edit regression: `finishProfileAvatarSave` rerendered the full form after a background avatar write. The trace recorded the draft preserved but its caret moving from 10 to 0. The existing local caret-only assertion did not reproduce that platform-dependent symptom. The browser regression now additionally requires preservation of the actual live input node, without weakening its existing caret, focus or subsequent typing assertions. It also verifies the success notice remains visible.

The corrected completion updates only its notice when a name/username field is actively being edited. It does not replace the field or schedule an avatar-focus callback. Existing account/session/revision/screen guards remain. Success and pending feedback both keep the existing notice lifecycle.

- Old behavior: four new profile orchestration cases failed; the strengthened iPhone browser case failed because the active input was replaced. Logs: `work/release-4.31-caret-red-unit.log`, `work/release-4.31-caret-red-browser.log`.
- Full syntax/unit/integration suite after both fixes: 2,739 passed, zero failed/skipped (`work/release-4.31-unit-verified.log`).
- Independent Chromium Android/WebKit iPhone synchronization: six passed (`work/release-4.31-sync.log`). Account link reached the peer in 1,698ms while preserving an unrelated rejected pending note. Note create/edit/offline/delete, CAS conflicts, settings, expenses/closure and outbox restart also passed. This run preceded the isolated avatar UI completion adjustment.
- Identity and profile journeys: 21 passed across Android, iPhone and iPad profiles (`work/release-4.31-mobile.log`), including the live-input and caret assertions. A later additional toast assertion/screenshot is verified in the final focused run and remote QA, not retroactively attributed to this run.
- Capacity and contention gates passed: up to 100 events/5,000 expenses and 50 simultaneous synthetic editors, zero reported identifier or financial errors (`work/release-4.31-capacity.log`).
- Final post-fix synchronization rerun: six passed in 55.4s (`work/release-4.31-sync-final.log`); link delivery 2,318ms, expense delivery 484ms, closure 796ms. The independent pending intent was retained.
- Final live-input, caret, typing and visible-toast case: five passed across all mobile/large-text/reflow profiles (`work/release-4.31-caret-final-browser.log`). The iPhone screenshot was visually inspected.
- Signed AAB and APK builds, including Android release lint, passed. All 181 web assets matched each package; signature matched the previous release. Source fingerprint: `00CA767588E4DB508870AD692347DFB1E42D575B5A9690338B71F7B68CBEA0EE` (624 files). Android store readiness returned `androidReady: true`.
- Pre-deploy public availability: 10 passed, zero warnings/failures (`work/release-4.31-predeploy-health.log`).
- The initial version-bump suite caught an outdated service-worker fixture and missing 4.31 release notes. These release metadata omissions were corrected; no assertions were removed.

## Verification boundaries

Browser fixtures are synthetic and separate from production. PostgreSQL integration tests separately exercise actual SQL guards/RLS and final merge payloads. There was no physical Android/iPhone/iPad connected to inspect. The iPhone profile screenshot was inspected for a meaningful rendered screen and visible pending feedback; it is not certification of every layout.

Native iOS publication is blocked: GitHub Actions has no Apple variables or secrets configured; local checks also lack Apple team/association and native Google OAuth configuration. No predictably failing TestFlight workflow was dispatched. Website/PWA delivery to Apple devices must be distinguished from native App Store publication.

Vercel connector access to the active project returns 403. Publication uses the existing authorized Git integration; private runtime-log/drain access is not certified by the public health checks. The separate older blocked Vercel project is not the publication target.

Build, immutable commit, store publication, final exact-source checks and CI results are recorded separately in the release handoff report after those actions actually finish. No claim here guarantees the absence of every possible bug or zero network latency.
