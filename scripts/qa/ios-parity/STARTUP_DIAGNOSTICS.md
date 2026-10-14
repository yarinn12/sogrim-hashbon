# Unsigned iOS startup diagnosis

This fixture observes the delayed first-home readiness on app commit
`4e6f1dfba954fe34abcde60ed92af657e8457805`, tree
`6323e010cc2dc2ec818c5bb8c3bef1b712e15a56`. It does not fix or accept that
source. In QA run38591978447/job115949861258 the first valid status publication
arrived approximately45.241s after the original35s wait started. The retained
AX snapshots show an empty StaticText at2,61, not a ready payload with a
different element type. The delay's underlying cause remains unresolved.

## Evidence boundaries

`startup-diagnostics.js` is injected at document start before the existing
synthetic service and journey. It records DOMContentLoaded/load, existing product
performance milestones, local asset timings, synthetic request/response
boundaries, home and bridge predicates, App.getInfo, fonts.ready, double rAF,
capture post/ACK and the original readiness commit. It makes no extra fetch,
polling timer, DOM mutation, plugin call or readiness assignment.

`ParityBridge.swift` records capacitorDidLoad, viewDidAppear and public WKWebView
URL/loading/progress KVO transitions without replacing Capacitor delegates.
Primitive observations are captured on the UI thread and written serially on a
utility queue in `native-parity-startup-<session>.log`. Correlate native epoch
time, JS epoch/monotonic time, observed AppPID and session with the existing status
journal and XCTest timestamps. These are observations, not ownership proof.

The JS budget is128 events per document and the native budget256 per controller.
If the last sequence reaches a cap, absent later stages are inconclusive.
Only named synthetic endpoints, enum values and numeric timings are retained;
URLs, query strings, headers, tokens and request/response bodies are excluded.
Product errors/payloads in the original acceptance report are unchanged.

An initial missing live function versus a defined journey waiting for home,
plugin response, font loading or rAF can now be distinguished. A public loading
transition is not a WKNavigationDelegate callback or proof that a page is usable.
Compare plugin, font and captureACK durations rather than inferring a cause from
the screenshot or observer unavailability. Telemetry itself can affect timing;
a diagnostic pass cannot be transferred into an acceptance receipt for4e.

The observer still requires the same unique booted UDID, installed bundle/source,
exact executable path, UID, launch time and unchanged PID before sampling. On a
rejected path it retains at most4 related AppPID summaries (booleans, times,
lengths and digests), with no raw process command. These summaries are never
used as a fallback sample target. Zero exact candidates does not mean no AppPID.

## Preserved acceptance

`ParityUITests.swift` and `test_validation.py` are identical to their4e blobs.
The validator implementation in prepare.py is also identical. The original
35s initial wait, typed StaticText query, all subsequent assertions, nonce,
trusted input, ACK, lifecycle, normal/AX categories and cold app.launch remain.
Removing only observational calls reconstructs the original journey byte for
byte. There is no warm-up, placeholder status, retry or new timeout.

## Reviewed route, not dispatched

Branch `codex/ios-startup-diagnostic-4e-20261014` has Vercel preview disabled.
`.github/workflows/ios-startup-diagnostic.yml` is manual only. It requires exact
app4e/tree6323 and attempt1, checks fixtureHEAD against github.sha, uses npm ci,
records separate fixture/source identities, builds the real unsigned simulator
controller and executes the original categories. A failing default category
still stops AX. Its artifact is named
`ios-startup-diagnostic-<app_sha>-<run_id>` and retains logs/manifests/xcresult.
The manifest marks `diagnosticOnly=true` on this route. The ordinary parity
workflow only broadens log collection to retain the new observation journal.

Root must review this diff before push/dispatch. No action has been dispatched;
there are no Apple/Production keys, signing, archive, upload, tester changes,
deployment or new paid services in this route. Build194 in unsigned QA metadata
is not a signed TestFlight194. The source/signing gates remain closed.

## Local controls and limitations

Six Node controls cover bounded/redacted events, a failed sink, unchanged
acceptance bytes, and actual journey progression through a deferred plugin,
font and rAF boundary while readiness stays false. The same stage-coverage
control fails against the original journey (missing app-info-start) and passes
with these observations. This is a diagnostic coverage control, not an OLD/FINAL
fix of the Native startup delay.

Twenty-three Python observer controls and51 unchanged validator controls pass;
PythonAST parsing, JS syntax and actionlint pass. Observer tests use an extended
Windows path inside the owned checkout to avoid MAX_PATH, without changed
assertions. npm ci succeeded using the pinned lockfile.

The first broad normal attempt failed under local sandbox temp/private-path
access restrictions. A second isolated attempt was interrupted before its
summary after inherited watcher timing failures. Architecture/esbuild could not
read a parent directory under this sandbox. Those runs remain non-green; no
require_escalated or parent grant was used. The temporary local tsconfig was
removed and is absent from the diff. Root requested focused review before a
broad run. Swift/Xcode compilation, KVO delivery, SDK overhead and Simulator
execution still require macOS; no new Native acceptance is claimed here.

Apple documents estimatedProgress KVO support in
[WKWebView.estimatedProgress](https://developer.apple.com/documentation/webkit/wkwebview/estimatedprogress).
