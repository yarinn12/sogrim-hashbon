# Cross-platform QA capacity and exact coverage — 2026-10-15

Base source: `d92a6184a24fe693b8da2ebc13c5accef7f38c12`. This change is
QA-only and does not deploy or sign an application build.

QA467 ran 482 cross-platform cases with one worker. Its 30-minute job ended
with `The operation was canceled` after a partial dot log, without a complete
result. The prior successful QA465 run recorded 478 passes and four intentional
scope skips. Neither observation establishes that QA467 passed.

Two jobs run the unchanged `playwright.cross-platform.config.mjs` with
`--shard=1/2` and `--shard=2/2`. Each retains one worker, CI retries, flaky
failure and a 30-minute deadline. They use distinct QA ports, local-state paths,
output folders and artifacts. A separate `cross-platform` job keeps the existing
required-check name and requires both shard jobs to succeed.

The aggregate generates an unsharded `--list`, both shard plans and five
per-project canonical lists from the exact source. The captured QA467 lists
contain 482 cases across five projects, 241 in each shard. Playwright's grouped
`spec.id` changes when the first project in a group changes: the compact Firefox
login case has the Chrome ID in the full list but its own ID in shard 2. The
verifier therefore matches file, full suite/title path, line, column and project,
then checks the grouped raw ID against that group's first project's canonical
ID. It requires all planned cases exactly once, matching executed results,
receipts for source/tree/run/attempt, zero unexpected or flaky results, and no
retry or missing result. The four allowed skips are fixed to their
per-project IDs, file, title and annotation in original QA465 artifact
`11967743798` (ZIP SHA256
`4873478576b9b9004a387c9bd84d97ddaeaa7050411e681e380392459234dcfd`).
No other skip is accepted.

`unit-and-mobile` and public release policy now require both shard jobs and the
aggregate. The QA workflow has 18 required jobs, while the four required
release workflows remain unchanged. Existing iPhone shard rules are unchanged.

Regression evidence: before the workflow/policy fix, the new normal-suite
tests failed on missing `cross-platform-shard-1` and because removing it still
passed release evaluation (9/11 focused checks passed). Afterward the 17
focused workflow, inventory and release-policy checks passed. The captured
all/1-2/2-2 lists reproduce the grouped-ID mismatch and verify the new
241/241 exact union. These are read-only Playwright inventories and synthetic
execution results; no browser suite has run on this candidate. The first full
CI run must confirm both shards finish within their original deadlines and
that the aggregate accepts actual browser results.
