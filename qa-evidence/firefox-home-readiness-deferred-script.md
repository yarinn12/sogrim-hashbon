# Firefox home readiness before DOMContentLoaded

PR 55 source `9e96d419485e9d37506da3c7089954d9bf0e826b`, cross-platform
job `114332901947`: desktop Firefox first attempt timed out in `beforeEach`
at `page.goto('/', { waitUntil: 'domcontentloaded' })`; retry passed, so CI
reported 219 passed, 4 skipped, 1 flaky and failed the job. The failed trace
shows the home UI rendered. Its 152 recorded network responses had status 200
or 206 and completed near the start of the 90-second wait. The application
steps of the history test did not run on that attempt.

The readiness helper waits for navigation commit, then for the existing
`sogrim:start:app-module-ready` milestone or `DOMContentLoaded` if the app
module fails. Its eight-second home budget starts after that signal. It still
requires the actual home screen to be visible and the local Hebrew Rubik face
to load. A new
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

## Follow-on combined-candidate startup timing

On combined source `6f7363698bbee91398c04d842494d714f3ccc599`, a local
Chromium attempt failed before the history test body: `page.goto` reached
commit in about 42 ms, then the home screen was absent throughout the
eight-second visibility window. The resource responses were successful, but
the app's `/api/config` request and first screenshot appeared only about nine
seconds after commit. The trace does not identify the exact reason module
execution was delayed. This exposed a QA contract change: before the earlier
commit-based helper, module execution belonged to the navigation phase, and
the separate eight-second UI budget began afterward.

A controlled fixture now delays the `app.mjs` response by 4.5 seconds and
uses a four-second home budget. It failed on the commit-based helper because
the home timer expired before the module could execute. It passes when the UI
budget begins at `app-module-ready`. Held image and held deferred-script cases
still pass before their unrelated resources finish; broken-module controls
still fail and now require startup milestone/status diagnostics in the error.
The navigation phase remains bounded by Playwright's test timeout, and the
home visibility timeout is unchanged for normal journeys.

The delayed-module, held-resource and broken-module controls passed 14/14
across the applicable desktop projects. The full affected platform coherence
file passed 56/56 across desktop Chromium, Firefox, WebKit and compact
Firefox, with no retries.
