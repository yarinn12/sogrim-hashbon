# WebKit cancellation diagnostics during two-client refresh

The final error guard in QA run 36750725558 failed after the repayment journey's
data assertions had passed. It reported two native WebKit `pageerror` messages
for the shared/personal `select=updated_at` requests at `fetchTimeout.mjs:40:23`.
There were no independent window `error` or `unhandledrejection` events. The
original artifact only retained the test trace, so its exact transition timing
cannot be reconstructed.

## Reproduction and cause

Linux diagnostic run 36754497383 reproduced the same native message and stack
while overlapping version reads were canceled by main-document replacement.
The unchanged application `fetchWithTimeout` implementation was used. Rejections
reached their catch handlers, native messages arrived between reload start and
document commit, and no runtime errors were recorded. The native console message
is mapped to `pageerror` by Playwright's WebKit adapter even when fetch is caught.

The normal-suite regression starts shared/personal reads, catches their failures,
and reloads the document three times. Before the recorder fix, run 36755131809
(f2b1b15) failed **2/2** on `expect(errors).toEqual([])` with the exact native
messages. Its assertion that canceled reads reached their catch handlers passed.

## Correction and boundaries

The sync recorder now reuses `isWebKitReloadDiagnostic`, already used by the
save-feedback suite. Recognition requires WebKit, the specific reloading page,
the synthetic backend's `/rest/v1/` URL, and the exact native message shape with
its stack. The repayment fixture marks only the interval from `reload()` through
main-document commit; it clears the mark before waiting for the new page to load.

Independent window `error` and `unhandledrejection` events remain unconditional
failures. Existing exact-URL offline handling, write/acknowledgement assertions,
repayment data checks and final empty-error assertion are unchanged. No runtime
application files, release versions or native packages change.

The normal suite also verifies real unhandled rejections and thrown exceptions
during the marked window. A recorder contract test replays the native event shape
captured in Linux to verify page, backend and commit boundaries. Ordinary CORS
errors produced directly by `page.evaluate` have an empty stack on both tested
platforms and remain strict; using those as a positive reload fixture was an
incorrect intermediate test expectation, corrected without broadening the guard.

## Verification

- `npm test`: **3,144 passed**, no failures or skips, syntax checks passed.
- Final local recorder suite: **6/6 passed**, retries disabled.
- Android-profile Chromium and iPhone-profile WebKit repayment/offline/refresh
  scenarios: **2/2 passed** locally; all canonical rows and refreshed clients checked.
- Initial Linux fix run 36755812781: actual cancellation regression **2/2 passed**,
  repayment journeys **4/4 passed**. Overall run had four failures from the two
  incorrect intermediate positive-CORS fixture expectations described above.
- Final focused Linux verification: run 36757037693, attempt 2, **16/16 passed**
  in two minutes, retries disabled (job 110330078371, artifact 11156040287).
  This includes two runs of each recorder case and both repayment directions.
  Attempt 1 was canceled during browser dependency installation, before tests.

Browser device profiles and intercepted backend traffic are synthetic, not real
device or production synchronization proof. Diagnostic-only copied tests and
temporary workflows remain outside the isolated fix commit. Release CI must run
on the integrated release head before publication.
