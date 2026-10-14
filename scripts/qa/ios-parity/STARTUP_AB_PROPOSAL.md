# Unsigned iOS startup A/B proposal

This branch changes QA instrumentation and a manual workflow only. It does not
change application source, the original 30-second journey home wait, the
35-second XCTest status wait, or the synthetic service. It has not been
dispatched or pushed.

The four cold arms run **on one macOS host**, in this order:

| Arm | Application | Stall observer | Simulator |
| --- | --- | --- | --- |
| 1 | `3f1976105fbc6bae48fcc1ff3ed975db5a8b98c1` | off | new |
| 2 | `4e6f1dfba954fe34abcde60ed92af657e8457805` | off | new |
| 3 | `4e6f1dfba954fe34abcde60ed92af657e8457805` | on | new |
| 4 | `3f1976105fbc6bae48fcc1ff3ed975db5a8b98c1` | on | new |

The ABBA order reduces, but cannot eliminate, host drift. Both source trees are
pinned and checked before build. The fixture is based on `14d6f43`; its exact
commit and tree are recorded separately from each application source. The
script verifies that `journey.js`, `ParityUITests.swift`, and
`synthetic-service.js` are byte-identical to the reviewed fixture.

Each arm creates and boots a fresh iPhone simulator of the same device type and
iOS runtime. It runs the original unsigned `test-without-building` once, with
no retry and the original wait. The source-specific build is reused for its
second arm. Observer-off means the host `native_stall_monitor.py` process is not
started; all in-page diagnostic instrumentation remains the same. A warm run,
if useful later, needs a separately labelled experiment and is not acceptance
evidence.

`build/startup-ab/host.json` records a digest of the host name, OS, architecture,
Xcode, device type, runtime, and fixture identity. Each arm's `identity.json`
records its source/tree, fixture/tree, fresh simulator ID, observer mode, XCTest
exit status, and document `performance.timeOrigin` from the startup journal.
The journal retains each event's document time and native receipt time, so the
two clocks must be aligned before comparing milestones. The original XCTest
result and observer failure remain visible even when another arm continues.
The four identities and summary are retained if source preparation, simulator
boot, build, XCTest, or the observer fails. `diagnosticComplete` requires all
four arms, successful XCTest and observer outcomes, collected native files, and
one document clock origin per arm. `releaseAcceptance` is always false.

The QA-only resource logger uses exact `capacitor:` protocol, `localhost` host,
and a fixed list of bundled asset paths. It sends only allowlisted asset classes
and timing numbers; no URL, header, payload, or arbitrary path is sent to
Native. It also reads Resource Timing entries already present when the logger
is injected, de-duplicating any later observer delivery.
`legacyOriginMatched=false` on a captured local resource would prove
that the former `URL.origin === location.origin` predicate missed it in actual
WKWebView. If the resource summary remains empty, Resource Timing support or
delivery still needs investigation; do not infer a product network failure.

Controlled logger regression: running `tests/startupDiagnosticResource.test.mjs`
against the original `14d6f43` logger failed all four cases. It missed the local
resource when `location.origin` was `capacitor://localhost`, and accepted
different-host custom-scheme entries when it was `null`; it also missed entries
recorded before injection and had no de-duplication. The patched logger
passed all four cases. This is a synthetic proof of the logger defects, not proof
that WebKit emitted those entries in run 38603426284. Local QA controls passed:
51 validation tests, 23 stall-monitor tests, and 4 A/B result-accounting tests.
The two focused JS test files passed 11/11. A Windows `qa:unit` run passed
3084/3089; its five failures were sandboxed temp/esbuild path access,
private-directory access, and Playwright-listing child processes. Native A/B
has not run.

The new workflow is manual and guarded to this proposal branch. It is not a
TestFlight gate or release approval. Do not push or dispatch it without Root
review, an explicit decision on runner cost, and confirmation that Vercel branch
deployments remain disabled. It uses no credentials, signing, store upload,
production database, or Vercel call.
