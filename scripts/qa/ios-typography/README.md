# iOS Simulator typography probe

This QA-only workflow measures the **exact pinned application commit** inside a
plain iOS `WKWebView` on an available iPhone 16 or iPhone 15 simulator. It uses
the app's local HTTP server, synthetic event data, and the app's bundled Rubik
and Inter fonts. It does not run the Capacitor bridge (`nativeShell: false`),
build a signed IPA, use Apple authentication, or publish to TestFlight or a
store. It is not a physical-device acceptance test.

On a push to `codex/ios-typography-probe-*`, the workflow reads `PUSH_APP_SHA`
from its YAML. Update that full SHA to the reviewed source commit before the
first push. Manual dispatch also requires a full `app_sha`. The workflow
checks the checkout against the requested SHA before preparing the temporary
simulator host. It has read-only repository permission and uploads the source
file hashes, raw JSON and four phase screenshots per available system size,
simulator version and content size category, plus build and server logs.

The four phases are: OS-default home text and Rubik weights 400/500/700/900;
OS-default summary copy; 32px participant-share control; and 32px repayment
picker. The repayment phase targets the repayment picker by action, waits for
the selected label, and verifies its selected state. The validator requires the
expected source, screens, loaded Rubik faces and 32px controls. It records
actual word lines and weight ink coverage without replacing CSS or forcing the
lines to match. Review the JSON and screenshots together. Differences remain
findings until the source is fixed and the simulator run is repeated.

The workflow builds once and collects those four phases at two **real iOS
system** content-size settings on the same simulator. The first run uses the
fresh simulator's default (`UICTContentSizeCategoryL`). After collecting that
report, it checks `xcrun simctl help ui` for `content_size`, uninstalls the QA
host to reset its web data, asks simctl for `accessibility-extra-large`, reseeds
the local server and runs the same built host again. Each setting has its own
JSON and screenshots under `default/` and `accessibility-extra-large/` in the
artifact. `os-size-comparison.json` records the native category, native Body
point size, root font sizes, and representative home/summary sizes. The pair
validator requires the larger native and web sizes to grow. The 32px query
parameter is a separate local preview in the later phases and is **not**
evidence that the OS preference changed.

If this Xcode version does not expose `simctl ui content_size`, or rejects the
chosen category, the default report remains in the artifact and the workflow
fails with `simctl-ui-help.log` / `os-content-size-error.log`. It does not label
the unavailable second run as passed. The exact simctl help and larger-category
result must be confirmed on the macOS runner; they cannot be verified on the
Windows authoring host.

The local smoke check of the injected JavaScript against the pinned source
passed on Windows Chromium and Playwright WebKit. A macOS iOS Simulator build
cannot run on the Windows authoring host, so compilation and native rendering
must be confirmed by the guarded workflow.
