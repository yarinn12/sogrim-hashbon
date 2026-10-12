# Account UI source checks on Linux and Windows

The creator roster check in `tests/accountUpgradeUi.test.mjs` used a CRLF-only end delimiter. GitHub QA run 38278682518 on source `42e0d82246521a25564b0782418f9b4a7fe3aa2c` checked out LF files. The end delimiter was absent, so `slice(start, -1)` included the ordinary participant branch. Its legitimate checkbox/check mark made the creator assertion fail. The same source passed the Windows unit job (run 38278682181).

The section helper now normalizes CRLF to LF and asserts that both boundaries exist before slicing. The creator assertions remain unchanged. Additional normal-suite cases compare both line endings, preserve the ordinary participant's real checkbox and removal action, and reject missing boundaries. No application UI code changed.

Evidence on 2026-10-12:

- Exact old Linux normal suite: 3,625 tests, 3,624 passed, 1 failed, 0 skipped/cancelled, 64,346.55727 ms. Failure: creator roster assertion at line 13. Downstream QA jobs were skipped and are not accepted.
- Exact old Windows normal unit job: success on the same source SHA.
- Private controlled mutation restores only the old unnormalized, unchecked section helper while keeping the final assertions. 10 tests: 7 passed, 3 failed, 0 skipped, 127.039 ms. Failures cover the original creator check, LF/CRLF isolation, and missing-boundary rejection.
- Final focused and nearby run: `node --test tests/accountUpgradeUi.test.mjs tests/eventNotesUi.test.mjs tests/currencyUi.test.mjs tests/iosSubmissionPreparation.test.mjs tests/storeAssetsCurrentFlow.test.mjs`. 25 tests passed, 0 failed/skipped/cancelled, 615.6677 ms.
- `git diff --check` passed. The new immutable source requires a fresh complete GitHub QA run; these local results do not replace it.

The controlled mutation and logs are private local evidence outside the repository. These source checks validate the intended markup branches, not a physical device or a live store upgrade.
