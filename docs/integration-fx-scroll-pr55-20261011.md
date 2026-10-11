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
- A broader `npm test` attempt reported a failure in PR55's `androidNativeCloseWatchCleanup.test.mjs` late-startticks/TERM timing assertion while other QA was running. That run was stopped and is not a full-suite pass. PR55's separate native QA results do not certify this combined tree.

## Release checks remaining

The FX boundary migration `supabase/migrations/20261011120000_preserve_expense_fx_at_snapshot_boundary.sql` is local only. It must be approved and checked on staging with the read-only verification script and old-client/new-client writes before release. Combined native, cross-platform and real-device QA must run against this exact tree. No push, publication, live migration, permission change or physical-device test was performed here.
