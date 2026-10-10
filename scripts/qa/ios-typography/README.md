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
file hashes, raw JSON, four phase screenshots, simulator version and content
size category, plus build and server logs.

The four phases are: default-OS home text and Rubik weights 400/500/700/900;
default-OS summary copy; 32px participant-share control; and 32px repayment
picker. The validator requires the expected source, screens, loaded Rubik
faces and 32px controls. It records actual word lines and weight ink coverage
without replacing CSS or forcing the lines to match. Review the JSON and
screenshots together. Differences remain findings until the source is fixed
and the simulator run is repeated.

The local smoke check of the injected JavaScript against the pinned source
passed on Windows Chromium and Playwright WebKit. A macOS iOS Simulator build
cannot run on the Windows authoring host, so compilation and native rendering
must be confirmed by the guarded workflow.
