# Local FX, friend visibility and PR55 integration candidate

This worktree combines the account upgrades and foreign-expense work with the current public PR55 head for review. It has not been pushed or released.

## Sources and boundary

- Candidate branch: `codex/fx-scroll-pr55-integration-20261011`.
- PR55 head: `2c5a4ad1b2bdc7248ca6be8a9161e825e1c03296`, verified with `git ls-remote origin refs/pull/55/head` on 2026-10-11.
- Account and FX branch head: `6e7f4b3` (`codex/foreign-expense-input-20261011`).
- Local merge: `61872b4`; friend-list visibility commit: `7d87fb2`, replayed from `c3de1e0`. The latter keeps a newly selected friend in view and focused, including WebKit and reduced-motion behavior.
- Both source branches and PR55's worktree remain untouched. The integration worktree reuses the installed local `node_modules` through an ignored Windows junction.

## Local checks

- Focused Node suite covering database integrity, account UI, FX, cloud writes, save feedback and PWA behavior: **338/338 passed**.
- Focused Playwright account UI, foreign-expense and friend visibility specs in Android Chromium and iPhone WebKit profiles: **20/20 passed**.
- An earlier sandboxed broad run stopped at `androidNativeCloseWatchCleanup.test.mjs`. A focused, no-retry reproduction showed Git Bash could not create an MSYS named object (`NtCreateDirectoryObject`, `0xC0000022`) before the fixture script started. The same case passed outside the sandbox; the entire cleanup file passed **42/42** there. The assertion now includes process diagnostics if startup fails again.
- The final complete local Node suite passed **3,611/3,611**, without retries and with one worker, outside the Windows sandbox. A two-worker run hit five Windows Git Bash DLL-initialization failures before its synthetic cleanup scripts started; the cleanup file then passed **42/42** alone and the entire serial run passed. This runs the repository's 361 `*.test.mjs` files; it is not native/device QA.
- Disposable PGlite database checks passed **218/218** on the fresh schema and **218/218** on the upgrade path. A separate migration lifecycle test verified that the FX trigger installs inside a transaction, disappears on rollback and installs again from the previous local schema. Both database modes exercise legacy and current save payloads and acknowledged writes using the real SQL RPC/trigger with an in-process HTTP adapter.
- Independent review found that the first `create_shared_event_snapshot` INSERT could omit the creator's saved FX metadata. The trigger now reconciles that first write against the authenticated creator's own matching workspace; a conflicting ledger fails with `PFX01`. An account-owned workspace belonging to someone else is never a source. The read-only rollout verification now rejects a trigger definition lacking this INSERT branch.
- Follow-up review found that an old FX record could be restored after an explicit removal when both the expense edit time and restoration marker were absent. INSERT and UPDATE now require a matching, valid restoration clock strictly later than the removal; a JSON-null removal key alongside FX is also rejected. Clock matrices cover missing, null, invalid, older, equal and newer values, with and without tombstones, while preserving ordinary untimestamped legacy expenses.

PGlite executes PostgreSQL SQL, PL/pgSQL and local policy checks with a small Supabase Auth schema shim. No local `psql`, PostgreSQL server or Docker runtime was available. These tests cannot establish actual hosted Supabase Auth, PostgREST, RLS integration or operational migration behavior; those still need staging verification.

## Release checks remaining

The FX boundary migration `supabase/migrations/20261011120000_preserve_expense_fx_at_snapshot_boundary.sql` is local only. It must be approved and checked on staging with the read-only verification script and old-client/new-client writes before release. Combined native, cross-platform and real-device QA must run against this exact tree. No push, publication, live migration, permission change or physical-device test was performed here.
