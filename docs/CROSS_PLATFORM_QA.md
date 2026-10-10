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
32px text preview. It records the actual viewport, root font size, text,
Hebrew words on each line, word fragmentation, family, weight, size, line height,
color, direction and horizontal clipping. Screenshots and JSON measurements are
attached to the Playwright report.

The paired comparison requires identical text and word lines. It permits at most
one CSS pixel of width rounding and one pixel of box-height rounding per line;
it does not weaken the word, font-size, overflow or clipping checks. CSS family
names are normalized only for optional enclosing quotes. Font loading must
still pass the independent local-resource and loaded-face assertions.

GitHub's `QA` workflow runs cross-platform verification as a separate required
lane of the `unit-and-mobile` aggregate alongside unit, mobile and synchronization
jobs. A failed, cancelled or skipped lane fails that aggregate. Automatic Vercel
deployment from this workflow requires the whole QA run to succeed. Manual
deployment and provider Git integrations are separate paths; this does not claim
they all enforce the aggregate.

Browser device profiles and text previews are not native-device acceptance.
Native simulator/emulator evidence must identify its source SHA, packaged web
assets, actual Capacitor bridge, OS text category/scale, keyboard and viewport
state. Preserve normal and enlarged-text screenshots separately. A plain
WKWebView probe cannot close a Capacitor-shell check. Physical-device,
installation/upgrade and live-provider checks remain separate acceptance tasks.

For every product bug, keep the permanent test with the fix, demonstrate the
relevant failure before the fix and success after it, and record the tested
source. Controlled faults must be isolated and completely restored; they prove
test sensitivity for the injected scenario, not a historical product defect.
Passing these suites protects their covered scenarios, not a guarantee that all
future bugs are impossible.
