# Live settlement UX audit — 2026-09-08

The audit follows creation/joining, participant linking, expense entry/editing, concurrent changes, offline recovery, settlement, event closure, payment marking/undo, and reopening. Production financial data was not modified.

## Fixes and regression evidence

| Problem | Cause and correction | Before / after |
| --- | --- | --- |
| A peer expense update removed focus from the open close-event confirmation. | The render interaction snapshot did not recognize that confirmation. It now retains the dialog, scroll position, focus, and background interaction guard. | The retained two-client test failed at the second focus assertion after the amount changed, then passed through closure, payment, completion feedback, and navigation cleanup. |
| An open transfer calculation collapsed when its amount changed. | Calculated transfer IDs include the amount. The UI now restores the disclosure and focus by the same payer, recipient, and payment status when the old ID disappears; it also updates `aria-expanded` and the existing disclosure memory. | The retained test failed when the recalculated transfer lost its `open` attribute, then passed with the updated amount, open disclosure, accessible state, and focused row. |
| Ordinary members were offered close/reopen controls that the action handler would reject. | Both the featured and balanced settlement views now use the existing management permission check when rendering those controls. A brief explanation identifies who can close the event. Payment controls remain available to the appropriate participants. | Both outstanding-payment and balanced-account cases failed because close controls were present for the member; both passed after the change, including the manager's closure and the member's payment flow. |

Evidence logs are retained locally under `work/end-to-end-ux-focused-before.log`, `work/end-to-end-ux-focused-check.log`, `work/end-to-end-ux-focused-final.log`, `work/end-to-end-ux-roles-before.log`, and `work/end-to-end-ux-sync-final.log`.

Visual inspection of the new member guidance caught an inherited legacy white-on-light style before handoff. The guidance now uses the existing ink token, full opacity, scalable type, and wrapping. Both member scenarios retain an actual foreground/background contrast assertion of at least 4.5:1. Both failed before the style correction (including a 1:1 balanced-state result) and passed afterward; before/after evidence is in `work/end-to-end-ux-member-contrast-before.log` and `work/end-to-end-ux-member-contrast-after.log`.

The first exploratory calculation test incorrectly targeted an unused legacy markup class. It was corrected to operate the visible transfer explanation by keyboard. Later checks were corrected to inspect the actual navigation button's inert state, the visible calculation total rather than an expense label that the formula does not display, and dismissal of the intentional payment-completion dialog. These fixture corrections retain the focus, disclosure, value, and interaction assertions; they did not change application behavior to accommodate an incorrect test.

## Retained automated coverage

Six new cases in `e2e-sync/two-client.spec.mjs` cover:

- A peer expense arriving during close confirmation, followed by actual closure, payment marking, completion dismissal, and usable navigation.
- A recalculated amount arriving while a participant reads an expanded transfer explanation.
- Member/manager settlement controls with an outstanding payment.
- Member/manager settlement controls with a balanced account.
- A peer closing and reopening the event while another user retains an unfinished expense; editing remains disabled while closed, and the same draft can be saved after reopening.
- A foreground refresh during typing, preserving the text, focus, selection, and both users' expenses.

These cases run in the normal `npm run qa:sync` suite. They use independent Android-profile Chromium and iPhone-profile WebKit clients and the existing intercepted backend. They do not pretend to be PostgreSQL authorization tests; the normal unit suite separately includes database-backed integration checks.

Two additional unit cases in `tests/settlementInteractionState.test.mjs` verify that a recalculated payment retains focus on the correct pending route, and that a removed route never redirects focus to another recipient or paid history. An isolated copy of the pre-fix application failed the recalculated-route case; the corrected application passes both.

## Validation status

- `npm test`: **2,876 passed**, zero failures or skips, after the final application changes.
- `npm run qa:sync`: **34 passed**, zero failures or retries, after the final application changes.
- Selected mobile journey matrix: **236 passed, 19 profile-specific skips, zero failures**, across Android, iPhone, iPad, enlarged iPhone text, and 200% reflow. The six selected suites cover first use, expense editing, financial calculations, close resilience, identity linking, and mobile layout.
- The isolated four-client replay passed: initial hydration/reload, an online expense, an offline expense concurrent with another client's expense, deletion propagation, closure visible to all four clients, and all six resulting transfers marked paid and visible as paid on every client. Every complete expense record converged. All browser traffic was intercepted, with zero production mutations and zero browser errors. The harness scrolls back to the visible route tabs before opening settlement, matching the user's navigation after editing a long ledger.

The first baseline sync run had one non-reproduced failure in the Android join/offline-expense scenario: the expense row was not found within the existing assertion timeout. The unchanged scenario subsequently passed in a focused rerun, two full-suite runs, and three explicit repeated runs (**six subsequent passes**). Its root cause is not established; no assertion was relaxed or retry added. The expense helper now attaches a screenshot and limited synthetic state on failure to make any recurrence diagnosable. The failed baseline log remains available; the normal final run replaced its default trace directory.

No production deployment is claimed by this audit. Browser device profiles are not physical phones, and passing scenarios do not establish that every possible client or network state is bug-free.
