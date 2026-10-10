# Firefox home readiness before DOMContentLoaded

PR 55 source `9e96d419485e9d37506da3c7089954d9bf0e826b`, cross-platform
job `114332901947`: desktop Firefox first attempt timed out in `beforeEach`
at `page.goto('/', { waitUntil: 'domcontentloaded' })`; retry passed, so CI
reported 219 passed, 4 skipped, 1 flaky and failed the job. The failed trace
shows the home UI rendered. Its 152 recorded network responses had status 200
or 206 and completed near the start of the 90-second wait. The application
steps of the history test did not run on that attempt.

The readiness helper now waits for navigation commit, then requires the actual
home screen to be visible and the local Hebrew Rubik face to load. A new
browser regression holds an unrelated deferred script after the app scripts:
the home screen and font are ready while `DOMContentLoaded` has not fired.
With the old helper, the test failed at `page.goto` after its 5-second
navigation timeout. With the changed helper, it passed on desktop Firefox.
Existing broken-app controls still require the helper to reject a failed app
module, so this change does not treat navigation commit alone as readiness.

Focused checks across desktop Chromium, Firefox, WebKit and compact Firefox:
10 passed, including the original history journey, the new held-script
regression and both broken-app controls. This is local browser QA with a
synthetic page resource, not a live production latency measurement.

The complete affected `e2e/platform-coherence-regression.spec.mjs` matrix
passed 52/52 locally across the four desktop projects.
`npm test` passed 3,398/3,398, with no failures or skips, on this isolated
branch. The combined PR branch contains additional tests and requires its
own exact-source CI run after integrating this patch.
