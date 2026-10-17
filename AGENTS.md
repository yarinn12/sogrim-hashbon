# Repository working rules

## Permanent engineering and release workflow

Follow `docs/engineering-workflow-he.md` for every change. Use a separate branch,
small reviewable commits and immutable annotated checkpoints before change batches
and release handoff. Never move an existing checkpoint, force-push a shared branch
or use destructive reset as a rollback. Git checkpoints restore source, not data.

Keep presentation in `src/ui`, pure business rules in `src/domain`, persistence in
`src/data` and backend work in `src/server`/`supabase`. Extract legacy orchestration
incrementally with compatible adapters; visual changes must not modify financial,
identity, authorization or synchronization rules. Run `qa:architecture`, focused
tests and the complete normal suite. Unit and Integration partition the complete
inventory; E2E/mobile/sync/Native remain required for relevant changes.

Public deployment, including manual dispatch, requires all four release CI lanes
and their required jobs on the same exact source. Missing, skipped, stale or failed
verification blocks release. iOS, Android and PWA must use one approved source and
verified packaged assets. Use staged deployment verification before promotion.
Keep the production activation switch off until the existing database and store
gates are met. Do not claim branch protection or live CD is enabled from YAML alone.

## Regression tests for every bug fix

The user requires a regression test for every bug that is fixed. Treat this as part of the fix, not optional follow-up work.

1. Reproduce the reported failure and identify its cause. Add or extend a behavioral test covering that exact failure, preferably before changing application code.
2. Demonstrate that the test fails for the relevant reason without the fix and passes with it. Use an isolated baseline or controlled mutation; never overwrite unrelated user changes. Record the evidence. A passing test alone does not establish regression protection.
3. Keep the regression test in the normal automated suite and include it with the fix. An existing test may cover the case, but verify that it actually detects this bug; do not add redundant tests just to change a file.
4. Exercise the appropriate boundary. For synchronization or persistence bugs, test the actual final write payload and acknowledgement, not just an intermediate merge. Cover retries, concurrent edits, offline recovery, stale replicas, membership and permissions when relevant to the cause. Use independent clients for cross-device behavior and database-backed tests for database rejection paths. Keep test data synthetic and isolated from production.
5. Run the focused regression, nearby affected tests and the normal unit/integration suite. Run applicable mobile or two-client suites for changes affecting those flows. Report failures, skips and unavailable environments honestly.
6. Never make a test pass by weakening its assertion, skipping it, swallowing an error, bypassing authorization, hiding synchronization status or discarding pending user changes. Correct a faulty fixture only with a documented explanation that preserves the intended behavior check.
7. If a reliable automated reproduction is blocked, state the exact limitation and retain a concrete manual reproduction/verification procedure. Do not call the fix fully verified or promise that the bug cannot recur.

When handing off a bug fix, briefly state the cause, the regression scenario, the before/after evidence and what was actually run. Distinguish local/synthetic tests from real devices and live production verification. Tests protect the covered scenarios; they do not prove the application has no other bugs.

### Existing test entry points

- `npm test`: JavaScript syntax checks plus all `tests/**/*.test.mjs`, including database integration tests.
- `npm run qa:sync`: independent Android-profile Chromium and iPhone-profile WebKit synchronization scenarios.
- `npm run qa:mobile`: mobile UI matrix; use the relevant projects and focused cases during development.

GitHub QA already runs these suites. Do not claim that they block every deployment path without checking the actual deployment configuration.


## Screen-by-screen design review

The user reviews one page/area at a time. For every page we work on:

- Capture the current screen and its relevant scrolled, menu, empty and enlarged-text states. Use synthetic data and record browser/viewport limits; do not describe a browser preview as a physical Android/iPhone check.
- Inspect the whole page for alignment, spacing, actual SVG-to-text gaps, centered visible groups, RTL, wrapping, clipping, touch targets and content hidden by persistent navigation. Measure visible glyphs and text, not only their wrapper boxes.
- Explicitly report elements that feel like generic AI/template design: unnecessary card nesting, excessive glow/shadows, decoration without a purpose, repeated promotional blocks, inconsistent controls and generic copy. Explain the specific visual concern; appearance does not prove how the code was authored.
- Separate reproducible layout defects from subjective design choices. Preserve the agreed green brand, home hero and subtle glow; discuss broader visual changes with the user before applying them.
- Show findings and a concrete local preview for the current area, collect feedback and finish the agreed changes before advancing to another page. Keep the existing regression-test and release gates.
