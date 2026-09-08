# Recovery audit — 4.34 (162), PWA 482

The audit follows the reported account merge and stuck synchronization failures. Production verification is scoped to Korea and Philippines; reusable behavior covers new groups. Historical pending work is preserved. All new automated fixtures use synthetic identities and amounts.

## Findings and guards

1. **A replay used a new timestamp, so a successful canonical link never acknowledged the original receipt.** Confirmation now matches the event/source/target intent against one valid, dated canonical proof. A peer's identical committed link requires no additional write. Existing server authorization and immutable-link guards remain authoritative.
2. **Confirmation missed note and deleted-note authors and accepted ambiguous proof.** It now checks those references and requires a unique source mapping with a valid timestamp before declaring success.
3. **Late link recovery or invitation preflight could cross an account/session change.** Owner and session-generation checks stop stale work after asynchronous boundaries, before replacing state, changing a recovery queue, or showing a result. Same-account sign-out/sign-in is covered. An intentional synchronous local self-merge may advance its own expected participant; its successful completion has a regression test.
4. **The 25th pending action silently evicted the oldest unacknowledged action.** Both join and link queues now retain all unacknowledged entries, deduplicated and scoped by owner. These are durable intent, not caches. Actual device storage capacity remains finite; existing explicit permanent-rejection and missing-event recovery rules are unchanged.
5. **Missing storage could report success, allowing a merge without durable recovery.** Queue writes now require storage methods and report write errors. The merge stops before mutating identity or submitting the link if its recovery receipt cannot be saved.

## Regression evidence

The normal suite includes the new tests. The new `accountLinkRecovery.test.mjs` executes the actual app recovery orchestration and shared-event transport; assertions inspect the final RPC body, compare-and-swap version, canonical acknowledgement, preserved expense/transfer identity and amounts, unchanged unrelated event, lost-response retry, and session isolation.

Local evidence logs, under ignored `work/`:

- `audit-link-confirmation-red-root.log`: 8 relevant failures before fixes, including replay confirmation, peer commit, lost acknowledgement, cross-account write, note fields and ambiguous proof. The synthetic transport key was first corrected to meet the real minimum length; failures cited here are after that fixture correction.
- `audit-link-confirmation-green-root.log`: 58 nearby tests passed.
- `audit-durable-recovery-red-root.log`: 5 failures covering queue eviction, unavailable-storage acknowledgement, and starting a link without durable intent.
- `audit-durable-recovery-green-root.log`: 30 tests passed.
- `audit-link-session-red-root.log`: 2 failures covering a new session for the same account and late preflight state replacement.
- `audit-final-focused-root.log`: 206 nearby tests passed. An existing static invitation test was updated to require the new order: save into a temporary result, validate session, then assign state. Behavioral preflight isolation also runs.
- `audit-self-merge-guard-red-root.log` / `audit-self-merge-guard-green-root.log`: final review detected and fixed a local self-merge regression introduced by the new guard before publication; 17 focused tests passed afterward.
- Existing queue tests now require all 25 entries for one owner plus all 24 for the other, including the oldest entry. This deliberately strengthens the durable-intent contract.
- Storage quota fixtures include all required storage methods so the actual throwing write is exercised.

## Validation

- `audit-release-4.34-unit-frozen-root.log`: **2,769 passed**, 0 failed, 0 skipped, on the final application source. This includes the repository's database integration suite. No database migration is introduced in this release.
- `audit-core-mobile-root.log`: **106 passed** across Android-profile Chromium and iPhone-profile WebKit, covering first use, authentication feedback, friend identity, event creation, financial calculation, paid-transfer remainder, closure, invite recovery, profile concurrency, save feedback and received-expense resume.
- `audit-release-4.34-sync-root.log`: **9 passed** with independent Chromium/WebKit clients. The new interrupted-link scenario verifies canonical receipt, peer roster, reload, exactly one immutable link and retention of an unrelated pending note. The suite also covers notes, concurrent edits, settings, expenses, closure and restart during outage.
- `audit-release-4.34-frozen-mobile-root.log`: **35 passed** after the final source change, rerunning event creation and account identity flows across Android, iPhone, iPad, large text and 200% reflow profiles.
- `audit-release-4.34-storage-final-root.log`: **16 passed** after strengthening the quota fixtures.
- Final Android AAB build and release lint passed. All **181 packaged web assets** match the final native web build; the source fingerprint matches **624 input files**. AAB SHA-256: `38E9BB39FDD05770A41A0CB2C8935A756EB7F83282A553F365100B65960D6CB3`. Signing certificate matches the existing release. The intermediate bundle made before the self-merge correction was replaced and is not the release artifact.
- Read-only production availability: **10 passed**, 0 warnings, 0 failures. Priority-group verification confirms the account-link receipt and preserved financial totals. No production data mutation was performed in this audit.

Release artifacts and live publication are verified separately against final source and signed package hashes. Browser profiles are synthetic local environments, not physical Android/iPhone devices. Production checks are read-only for the priority groups; this audit does not rewrite their balances or repair other historical groups. These regressions protect the covered scenarios and do not prove that the application has no other bugs.
