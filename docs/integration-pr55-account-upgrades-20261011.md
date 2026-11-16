# Local PR55 and account upgrades integration candidate

This worktree is a local integration candidate only. It is not a release artifact.

## Immutable sources

- PR55 head: `0c335a421a30e962433c23573edb162169d3663d`, verified with `git ls-remote origin refs/pull/55/head refs/heads/codex/iphone-ui-alignment-20261010` on 2026-10-11.
- Account upgrades head: `962bd00bedfc827d265ae4fb4c57bac6f5e59f52` from `codex/account-upgrades-20261011`.
- Common ancestor: `c68b9d54bfbda29ad075e68eb419c061fb804f2d`.
- Candidate branch: `codex/pr55-account-integration-20261011`, created in a separate worktree from the exact PR55 head.

## Merge review

Git automatically combined the changes to the application, runtime config, PWA worker and UI layers. `tests/eventNotesUi.test.mjs` required manual resolution: retain PR55's assertions about notes header, action order and layout while asserting that the obsolete empty-state message and renderer are absent. The "new note" action and pinned/editor states remain covered. The source branches were not edited.

Overlapping files that need combined browser QA include `src/app.mjs`, `src/data/localStore.mjs`, `src/publicDesignCoherenceLayer.mjs`, `src/publicLedgerWorkspaceLayer.mjs`, `sw.js`, `e2e/first-use-journey.spec.mjs`, `e2e/pwa-update-recovery.spec.mjs`, `tests/eventNotesUi.test.mjs`, `tests/pwa.test.mjs` and `tests/serviceWorkerRuntime.test.mjs`.

The linked local `node_modules` directory is ignored and is only used to run tests without installing packages or adding a paid service. No live database, store, deployment, push or source-branch merge was performed.

## Local verification

- Focused Node regression suite for the combined changes: 112/112 passed.
- Full `npm test`: 3538/3538 passed on the final run. An earlier run had one failure in the existing 20 ms invite-deadline assertion under suite load; that test passed alone on retry, and the full suite then passed.
- Playwright account upgrades, first-use journey, pinned events, native update policy and PWA recovery: 52/52 passed across Android Chromium and iPhone WebKit browser emulation. No physical-device test or native build was performed.
- `git diff --cached --check` passed after the manual conflict resolution.

## Release boundary

PR55's native QA gates remain open. They must pass again against this exact combined tree before any Web, Android or iOS publication. Foreign-currency expense conversion is not included in this merge and should be built on the verified integration candidate in a separate change.

Independent QA also flagged a P3 contract gap in a hidden backup path. `renderBackupPanel` is defined but is not called by the daily UI. Its warning promises replacement, while cloud merge retains newer items; omissions in an old backup do not represent deletions. Recovery behavior was not changed in this integration. Agree on separate contracts for personal and shared-event data before exposing that path in the UI. This gap does not block the local integration candidate.
