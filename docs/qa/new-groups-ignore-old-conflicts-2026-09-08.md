# New group invitations remain independent of older rejected work

## Scope

The user restricted current work to Korea, Philippines, and new groups. Historical identity-conflict repairs are deferred; the earlier Maor/Ariel questions are no longer a prerequisite for this task. No historical records, payment states, identities, or outboxes were deleted or repaired.

Live PWA480 read-only UI checks found no pending badge in either priority group. Participant rosters, the committed account link, expense totals and balances were verified against the canonical records. Detailed production figures remain in local verification evidence. These checks are on desktop Chrome, not a physical phone.

## Reproduction and change

The actual invitation preparation and publication functions, exercised with the real local store and shared-event transports, refused a confirmed group's invitation when a different old group rejected its pending write. The group itself and the personal workspace index had both been acknowledged, but the account-level pending flag was treated as a blocker.

Invitation preparation now explicitly includes its own event in the write selection. Partial saves report the personal workspace receipt only after that attempt's personal write succeeds. Preparation may proceed while another event remains pending only if the final attempt confirms both this event and the personal event index; its own failed event ID or a missing personal receipt still blocks it. The old group's pending scope and intent remain intact.

## Regression evidence

Before the fix, the published-group and newly-created-group cases with a successful personal receipt both failed at the invitation-completion assertion. After the fix they pass. Negative cases retain the pending invitation when personal persistence fails, including when a successful receipt in an earlier attempt is followed by a failed retry. The new-group case exercises the actual create RPC payload, verification read, later update RPCs, and final personal write; it asserts exactly one creation and full preservation of the old pending event.

The initial fixture omitted empty schema fields, so successful reconciliation added normal defaults and triggered the full-record preservation assertion. Those defaults were seeded in the fixture; the full equality assertion remains unchanged. This did not alter the invitation reproduction or weaken any data assertion.

Six new persistence cases and nearby suites: 138 tests passed. Browser creation tests extend the existing slow/rejected publication scenarios with an old rejected group. Their synthetic notification endpoint requires the final canonical participant and personal event index before acknowledging membership. The old group stays unchanged, the new group is created once and its warning clears.

Final local validation: **2,755 normal tests passed**, zero failed/skipped; **6 creation browser scenarios passed** across Android-profile Chromium and iPhone-profile WebKit; **8 independent two-client synchronization scenarios passed**, with no unexpected writes or page errors. These are synthetic browser/backend checks, not physical devices or live notification sends. No invitations were sent to real people during verification.

Read-only canonical database verification also confirmed Korea's committed Liron receipt and both priority groups' participant/expense counts and amounts. Log files: `work/new-group-invitation-sibling-red-root.log`, `work/new-group-invitation-sibling-green-root.log`, `work/new-group-invitation-nearby-root.log`, `work/new-group-invitation-browser-root.log`, `work/release-4.33-unit-root.log`, and `work/release-4.33-sync-root.log`.

No database guard, financial validation, permission check, or sync-warning rule was relaxed. This is a client receipt/scope fix; server membership authorization remains unchanged.
