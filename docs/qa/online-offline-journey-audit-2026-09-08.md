# Online/offline journey audit — 4.35 (163), PWA 483

Scope: new groups and the existing priority groups Korea and Philippines. No historical-group data repairs or production financial writes were performed for this release. Offline coverage distinguishes guest participants without accounts from signed-in clients temporarily without network access.

## Validated defects and protections

1. Interrupted membership recovery could replace a new local expense with a projection captured before its membership read. Recovery now compares the state reference and save revision, retains the durable receipt and retries from the newer state. The regression executes the actual recovery, merge and CAS writer and asserts the final 1,234-minor-unit expense. A two-browser UI test independently holds the membership response, creates the expense and verifies one canonical expense on both clients.
2. Late join/config responses could affect another session, including sign-out and sign-in to the same account. Owner and session-generation checks now bound interrupted recovery, the public join form, snapshot invite entry, direct import, startup initialization and reconnect orchestration. Tests reject stale local writes, runtime assignments, receipt acknowledgements, notices and redirects.
3. Public invite redemption could succeed on the server and then lose its continuation when the following read failed. The original owner's durable join receipt is now recorded immediately after redemption, before the next read. It remains until persistence is accepted or queued; unrelated accounts do not consume it. A pending-join signal wakes the existing recovery scheduler even if the device remains online.
4. Public manual join persistence now explicitly selects its target event so an unrelated historical pending event does not determine which event is saved. No queue discard, authorization bypass or hidden failure status was introduced.

The native draft join flow and database authorization/history guards retain their existing implementation. No database migration is part of 4.35.

## Regression evidence

Private run logs remain under `work/`; committed fixtures contain synthetic identities and amounts only.

| Boundary | Before fix | After fix |
| --- | --- | --- |
| Interrupted recovery | 4 failed, 2 passed (`e2e-audit-join-red-root.log`) | 6 recovery tests pass, including actual final CAS payload |
| Public join session/receipt | 6 failed, 1 passed (`e2e-audit-public-join-red-root.log`) | All public join cases pass |
| Snapshot/direct invite entry | 8 failed, 2 passed (`e2e-audit-invite-entry-red-root.log`) | Both entry paths pass |
| Automatic recovery wake | 1 failed, 7 passed (`e2e-audit-join-wake-red-root.log`) | Wake is emitted and consumed by the real browser app |
| Startup/reconnect wrappers | 4 failed, 10 passed (`e2e-audit-invite-orchestration-red-root.log`) | Stale config/import completions have no later effects |

The three new normal-suite files contain 28 tests. The final focused run, including existing invite-layer cases, passed all 41. Existing source-shape assertions were updated to verify the stronger owner-plus-generation helper and exact selected event; behavioral checks remain in place.

## End-to-end matrix

`npm run qa:sync`: **14 passed**, no failures or skips. Each scenario uses separate Chromium Pixel 5 and WebKit iPhone 13 contexts with separate durable client storage and an isolated synthetic CAS server.

- Expense saved while interrupted-join recovery has an older membership read outstanding.
- Both devices add expenses and notes offline, reconnecting in both possible orders. Exactly two expenses, unchanged amounts and total, both notes, empty outboxes and persistence after reload.
- Offline note edit after peer deletion: deletion wins; no resurrection.
- Offline payment while the peer reopens the event: same transfer identity and amount, paid exactly once, later undo converges.
- Interrupted account link and confirmation on both devices.
- Account link while the peer creates a new offline expense and note and another group remains pending: identities remap, amounts are preserved and unrelated pending intent remains.
- Note create/edit/delete, same-field transport failures, concurrent field edits with a real synthetic CAS conflict, settings changes, event closure and restart during cloud outage.

The payment test was corrected during development to follow actual UI rules: select the transfer board rather than duplicate featured controls; assert notes are disabled in a closed event; reopen before adding a note; after undo, verify canonical pending status and close again before expecting the payment action. These were fixture errors, not product payment defects. Amount, transfer identity, canonical status and page-error assertions were preserved.

Focused mobile journey run: **36 passed**, no failures or skips, on Android and iPhone profiles. Includes first-use event/expense/settlement flow, creation draft return, identity linking, duplicate join taps, login/recovery feedback and retained/recovered sessions.

Final `npm test`: **2,797 passed**, no failures or skips, including syntax and database integration checks (`e2e-audit-4.35-unit-verified-root.log`). The initial final run had one timing-dependent existing account-deletion test failure under load. The product's 60 ms test deadline expired before retry. That test now controls both Date and setTimeout, advances the real request timeout, verifies the first abort and asserts exactly two requests to the verified user's endpoint. No production deletion code or acceptance assertion changed. All 9 deletion tests and the full suite pass.

## Release evidence and limits

Signed AAB and APK: 4.35 / 163. All 181 packaged web assets match the prepared source. Both retain the existing signing certificate; release source fingerprint matches the build manifest.

- AAB SHA-256: `BF6053DA34E4663F8785959DCA7E49B9B908247FDCDE37954CB7705AE14EE12B`
- APK SHA-256: `3F6FCE8307A7D89BE634CFA7879B7F2266374E5CD50B50DA6593B61594309403`
- Source SHA-256: `F05F77AEC578B0E78FA2D741E3FD8A79351A6E68A84DA93FC86569B2141A6AAC`

The browser matrix uses synthetic transport; it does not prove production RLS behavior, physical-device background/termination behavior, or an OS cold start while offline. Database integration tests separately exercise the existing SQL guards. No physical phones or Apple distribution build were available. Existing pre-stripped Android library symbol warnings remain.

The prior 4.34 CI run had a flaky iPhone scroll-test setup: the first document navigation received no response before the timeout; its retry passed. Trace contained only the unfinished document request, before app execution. Other CI lanes passed. This is recorded separately from product regressions and does not justify weakening navigation or flaky-test enforcement. The unchanged scroll suite passed all 14 cases locally on the final source (Android and iPhone, no retries or skips), bringing focused mobile checks to 50. New-commit CI status and live deployment results must be reported separately.

The historical-group permission warning on Home is not claimed resolved. Pending historical intent remains preserved. Covered tests reduce recurrence risk; they are not a proof that every possible bug is absent.
