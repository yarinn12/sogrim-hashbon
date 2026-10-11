# Cross-platform verification

Use synthetic local state for automated QA. These commands disable the server's
private environment autoload and do not write to production accounts.

| Command | Coverage |
| --- | --- |
| `npm test` | Unit, database integration and behavioral regressions |
| `npm run qa:mobile` | Android Chromium, iPhone/iPad WebKit, large text and narrow reflow |
| `npm run qa:sync` | Independent Chromium and WebKit clients; write acknowledgement, conflicts and recovery |
| `npm run qa:cross-platform` | Desktop Chromium/Firefox/WebKit, compact Firefox, matching text layout across all three engines |

Install the test browsers with
`npx playwright install --with-deps chromium firefox webkit` on Linux, or omit
`--with-deps` on Windows. The cross-platform command uses the normal Playwright
fixtures and an isolated server state file for its selected `PW_QA_PORT`.

The cross-platform journeys verify recovery and authentication feedback,
calculated balances and paid/undo actions, focus after dialog transitions,
navigation/return, long participant lists, note persistence and local font
availability. The paired comparison opens the same synthetic account and event
in each engine at 320, 393, 852-landscape and 768-tablet widths, including a
32px text preview and an explicitly simulated 37.647px iOS accessibility category.
Home, expenses, notes, profile, summary, share and repayment screens use the same
state in each engine. It records the actual viewport, root font size, text,
Hebrew words on each line, word fragmentation, family, weight, size, line height,
color, direction and horizontal clipping. Screenshots and JSON measurements are
attached to the Playwright report.

The paired comparison requires identical text and word lines. It permits at most
one CSS pixel of width rounding, one pixel of box-height rounding per line and
1/60 CSS pixel of computed line-height rounding ([Gecko layout unit](https://github.com/mozilla/gecko-dev/blob/master/gfx/src/AppUnits.h));
it does not weaken the word, font-size, overflow or clipping checks. CSS family
names are normalized only for optional enclosing quotes. Font loading must
still pass the independent local-resource and loaded-face assertions.

GitHub's `QA` workflow runs cross-platform verification as a separate required
lane of the `unit-and-mobile` aggregate alongside unit, mobile and synchronization
jobs, including the real Capacitor iOS simulator and Android emulator workflows. A failed, cancelled
or skipped lane fails that aggregate. Automatic Vercel
deployment from this workflow requires the whole QA run to succeed. Manual
deployment and provider Git integrations are separate paths; this does not claim
they all enforce the aggregate.

Browser device profiles and text previews are not native-device acceptance.
Native simulator/emulator evidence must identify its source SHA, packaged web
assets, actual Capacitor bridge, OS text category/scale, keyboard and viewport
state. Preserve normal and enlarged-text screenshots separately. A plain
WKWebView probe cannot close a Capacitor-shell check. Physical-device,
installation/upgrade and live-provider checks remain separate acceptance tasks.

`iOS Capacitor parity QA` builds an unsigned Debug simulator app from the exact
PR or dispatch SHA. Its QA subclass calls the original
`SogrimBridgeViewController.capacitorDidLoad`, uses the real SDK and packaged WWW,
and proves a native `App.getInfo` call. The synthetic service intercepts account
and state requests; it does not test real connectivity or a production database.
Typography navigation uses DOM actions; XCTest uses hit-tested native-coordinate
taps for the expense wizard, requires a UIKit keyboard, confirms the final
synthetic acknowledgement, and checks background/foreground and relaunch.
Accessibility fields are reached with bounded real finger drags when needed.
The QA mapper converts document points through the actual scroll view and
records its measured content insets and offsets. Trusted input events and
native/DOM keyboard geometry validate the mapping for the tested run
([UIKit scroll-view geometry](https://developer.apple.com/documentation/uikit/uiscrollview)).
It preserves the production iPhone portrait policy. Both the fresh OS default
and OS accessibility-extra-large categories must pass. The reusable workflow is
required by `unit-and-mobile`; it is not a physical iPhone,
signed distribution build, installation-upgrade or live authentication check.

The native artifacts include the source tree, WWW and fixture hashes, exact
Capacitor URL and bridge, UIKit window/WebView/status-bar/keyboard rectangles,
safe areas, and screenshots while amount/name input is active. Long transfer
names, missing glyphs, container/ancestor clipping and incorrect font-scale
ratios fail acceptance. Enlarged target sizes must match the measured UIKit
body-size ratio within 0.2 CSS px (root: 0.002 px). An explicit note-preview
ellipsis is allowed only when opening that same note recovers its complete title
and body. Twenty-four automated artifact controls exercise valid reports and these
failure conditions; they validate the report boundary, while real simulator
runs validate the app.
XCTest also retains whole-screen screenshots from `XCUIScreen` during amount and
name input, resume and restored display, including system UI and keyboard. Its
attachments are exported from the result bundle for inspection. Trusted click
and input events, mapped document/native coordinates and matching keyboard/
visual-viewport geometry are required for the actual input and save phases.

The browser iOS journey preflight executes the same synthetic service and
journey files through real DOM navigation up to the expense input. It mocks
Capacitor identity and screenshot acknowledgements only. It catches navigation
failures, including an attempt to click the deliberately hidden transfer summary;
it does not prove native bridge, keyboard or coordinate behavior.

`Android Capacitor parity QA` builds an isolated Debug APK from the exact source
SHA and audits its packaged WWW assets and local font bytes. An owned emulator
with physical networking disabled uses the real Capacitor bridge and OS font
scales 1/1.5/2 in portrait and landscape. The suite measures six font/layout cases,
24 display states and the eight-step IME/Back/save/edit/relaunch journey with
synthetic server acknowledgement. Temporary stacked-font and text-clipping faults
must fail and restored measurements must pass. Range boxes and Canvas ink
measurements remain in the artifacts; where their font metrics differ the whole
conservative Range box is used. Normal CI requires the reusable workflow through
the fail-closed aggregate. Live authentication, real connectivity recovery,
production data, release performance and installation upgrades remain separate.

For every product bug, keep the permanent test with the fix, demonstrate the
relevant failure before the fix and success after it, and record the tested
source. Controlled faults must be isolated and completely restored; they prove
test sensitivity for the injected scenario, not a historical product defect.
Passing these suites protects their covered scenarios, not a guarantee that all
future bugs are impossible.
