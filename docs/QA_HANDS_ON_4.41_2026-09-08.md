# Hands-on app audit — 8 September 2026

This continues the visual audit in `QA_VISUAL_UX_4.41_2026-09-08.md`. The app was operated through Chrome's visible UI using an isolated local server (4198), a synthetic profile and synthetic events. No production participant, event, expense, payment or message was changed. Phone (393×851), landscape (667×375), normal and in-app extra-large text were exercised. Browser profiles are not physical devices.

## Additional defects found through the UI

1. **Account-link pending notice.** Completing an offline-name/account link displayed a second, action-specific “waiting for cloud confirmation” notice. The generic sync guard did not cover it. Pending account-link completion is now silent; the durable receipt, retries, authorization checks, hard-error feedback and requirement for a cloud acknowledgement are preserved. The orchestration test now executes the actual completion-message function rather than substituting a fake message. It verifies that an unconfirmed link still has `pending: true`, `confirmed: false` and a retained recovery receipt.
2. **No explanation for a blank name.** Manual participant and offline-friend addition accepted the button press without explaining the missing input. Empty, whitespace-only and direction-control-only participant names now receive inline feedback, an invalid-field marker and focus. Feedback is removed on typing, and a valid name completes the original flow. The helper covers existing-event participant entry, new-event entry and offline friends. Error text is placed outside enclosing labels so it does not change the field's accessible name.
3. **Back loop after an account link.** Completed links left historical entries pointing at the removed source identity. Both the app's Back button and browser Back could reopen the roster or the old participant flow instead of returning to the event. The roster returns to the flow's recorded base, and browser Back skips stale entries. The regression verifies one back action, reopening the roster with three participants, and another clean exit.
4. **Broken close-event confirmation in landscape.** The floating modal inherited an older two-column inline-layout rule. Its heading column collapsed to almost zero width, splitting the title and confirmation button into individual letters. The modal now explicitly uses one column, a viewport-bounded height, independent scrolling and room above navigation. Portrait and landscape tests check title width, dialog bounds, real hit targets, cancellation, reopening and an actual successful close.

## Before/after evidence

- `work/hands-on-pending-before.log`: 11 passed, one expected failure on the actual pending notice. After: 12/12 passed, retaining the durable-recovery and rejection checks.
- `work/hands-on-before.log`: two expected Android UI failures: pending notice and blank-name feedback/focus.
- `work/hands-on-back-before.log` and `work/hands-on-browser-back-before.log`: the roster remained open after one app/browser back action.
- `work/hands-on-friend-before.log`: missing inline feedback for an empty offline-friend name.
- `work/hands-on-creation-before.log`: the new-event participant form also fails on missing blank-name feedback when the old application source is served in an isolated baseline.
- `work/hands-on-close-before.log`: portrait passed; landscape failed with only 56.46px available to the heading. Hands-on Chrome also showed a zero-width heading container and a 661px-tall dialog in a 375px viewport.
- `work/hands-on-matrix.log`: 45/45 passed across all five profiles for participant feedback, pending links, app/browser back and incoming-expense reconnect/resume scenarios.
- `work/hands-on-final-matrix.log`: final 75/75 passed across all five profiles, zero failures, skips or retries. Covers the four new defects and the earlier large-text, navigation, creation and roster regressions, including all three blank-name entry points.
- Intermediate close-dialog run: 14/15 passed. Its landscape WebKit preparation scrolled the summary tab under the intentionally clipped floating header. The final test explicitly scrolls it into the usable viewport and requires a successful hit test and unforced click; no application clipping guard was removed. `work/hands-on-close-visible.log`: that case passes.

## Manual flow coverage

- Home, event list and status filters; event entry; participant roster and management; offline-name/account-link preview and confirmation; reopening after navigation.
- Five-step expense entry: invalid amount, 125.50 amount, name, payer, participant selection, review, multiline notes and save. Verified the expense and notes in the expanded row and persistence after reload.
- Shared notes: create, multiline content, pin, save and list presentation.
- Event activity: the saved taxi expense and event closure appear in chronological order with the acting profile.
- Settlement: balances after the link and new expense, landscape confirmation, cancel/reopen/confirm and the locked-event state.
- Profile: edit, invalid partial name and cancel. Notifications and friends: local-account/empty states and offline-friend validation.
- New trip: details, repayment settings, manual participant validation, adding a name and opening the event. Share screen correctly explains unavailable cloud credentials in this local fixture; a live authenticated invite redemption was not claimed from this manual session. Authenticated joins, online/offline recovery and independent-client behavior remain covered by the automated suites.

## CI preparation correction and release gate

Run 34226182982 passed unit, backup, two-client synchronization and four mobile profiles, but rejected one flaky `reflow-200` test. Its failure occurred **before disconnecting**, waiting for a metadata-only preparation scan with an 8-second timeout while Home's normal scan interval is 15 seconds. The prerequisite now allows 20 seconds. The actual reconnect/native-return deadlines remain four seconds, with all persisted-expense and visible-row assertions intact.

The final revision must pass the complete mobile matrix, unit/integration, independent-client and backup CI lanes before release. Local unit/integration verification passed all 2,870 tests without failures or skips (`work/hands-on-final-unit.log`).

Native AAB/APK artifacts were rebuilt from the final runtime; all 181 web assets in each package match. Both packages use version 4.41/build 169 and the existing release signing identity. The source fingerprint matches 624 inputs. Android build/lint is distinct from native Java unit testing; no substantive Java unit suite is claimed.

- AAB SHA-256: `B126D316DA26949DEBB5AB7E6C08BC9AD01CB037830AD3C917E625C856DC51E2`.
- APK SHA-256: `BFDF075F1B369EE98717ED4ED43CDDEAB43F9FE0E0D99D3C11C84D7EF0204543`.
- Source SHA-256: `3FF84EAF2E5F76843F02408B0B05D2261590E373422C7A45811D1FB3FBF720D0`.

Tests protect these specific failures and neighboring flows. They cannot guarantee that every future change or physical device is bug-free.
