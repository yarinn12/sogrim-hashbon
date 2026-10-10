# Isolated Android Native QA

These scripts exercise an actual Capacitor Android `.debug` APK using ADB and
its debuggable WebView. They never select the first connected device. Provide
`ANDROID_QA_DEVICE`, `ANDROID_QA_AVD` and `ADB_PATH`; the AVD name is verified
before any command. Use a newly created empty AVD, never a user's existing AVD.

This run uses `emulator-5582` / `sogrim_bf49_20261010` and a debug test certificate
created under an isolated workspace Android home. CI uses its own fresh
`sogrim_ci_<run>_<attempt>` AVD. No upload/release certificate or private
configuration is used. Clean acceptance rejects diagnostic Native changes.

Prepare the normal WWW build with `SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD=1` and
`NODE_OPTIONS=--import=file:///absolute/path/to/offline-build-config.mjs`, then
run `prepare-fixture.mjs`, `cap copy android`, and offline `assembleDebug` with
the isolated Android user home. Set the release signing-properties path to a
verified nonexistent file. Verify the APK package is `com.sogrimhashbon.app.debug`
before installing. Set `ANDROID_QA_SOURCE` to the exact checked-out application
commit before `prepare-fixture.mjs`. The source guard rejects mismatched HEAD,
changed product files, or the diagnostic typography Native method. Run
`python3 scripts/qa/android-native-isolated/audit-apk.py "$PWD" "$ANDROID_QA_SOURCE"`
after building; runners require this fresh, successful WWW/APK/source audit.
Disable AVD Wi-Fi/data before launch. Only the empty QA app's
data may be cleared to seed a new source run.

The derived WWW index adds `fixture.js` before the product app. The fixture
provides a synthetic account/config, persists the actual personal snapshot
write and its version acknowledgement, rejects stale/foreign writes, and
blocks other external fetches. It advertises synthetic service connectivity;
the physical emulator remains offline. It seeds three participants and two
expenses producing two pending debtors to the owner, so the ordinary summary
description exists. The product JS/CSS sources are never modified for the fixture.
The provenance JSON records the real source SHA/tree and index/fixture hashes.

`journey.mjs` covers create/edit, actual Android IME, native Back, settings,
acknowledged final write payload and force-stop/relaunch persistence. Event
opening, expense editing and both saves use real ADB taps after a DOM hit test.
Amount typing and Back use native ADB input. Intermediate wizard selections use
DOM clicks and name/edited-value entry uses dispatched input/change events.
`ANDROID_QA_WARM_ATTACH=1` attaches initially to an already running QA app; this
is recorded and never counts as startup/performance acceptance. Existing expense
editing starts at review, then selects the amount row before changing it.
Its collapsed expense actions menu is opened with a real tap before editing;
the hit test deliberately rejects a hidden child that DOM click could trigger.

`matrix.mjs` records all six OS font-scale (1/1.5/2) × portrait/landscape cases,
native plugin readback, required visible selector counts, exact computed font
sizes, each Range glyph/container bound, three distinct tab labels, overflow,
fixed16px/rem probes, and screenshots. It restores OS settings in
`finally` and returns nonzero for any failed/missing case or check. The standalone
`matrix-verdict.mjs` is the exact CLI verdict boundary. Normal unit tests cover
that boundary and fixture persistence/CAS/network rejection. Controlled mutation
of the verdict to always return zero proves the regression turns red.
The runner verifies actual viewport orientation after `wm user-rotation lock`
and waits for actual Native OS preference and product reflow. Each case records its own failure
and the other cases still run. Expanded transfer helpers must have visible text;
their container is opened with a real tap rather than measuring a collapsed child.

Geometry keeps a fixed one-pixel containment limit. DOM Range boxes include
unused font ascent/descent; Canvas `actualBoundingBoxAscent/Descent`, measured
with the actual loaded computed font, estimates painted vertical bounds when
Canvas font metrics and the DOM fragment height agree within one pixel. Raw
Range boxes and per-grapheme metrics remain in each report. On a metric mismatch
the entire conservative Range box must fit; no inferred baseline or larger
tolerance is used. Horizontal bounds always retain conservative DOM Range widths.
Every actual `overflow: hidden/clip/auto/scroll` ancestor is checked independently,
including the text element itself. A visible linebox's scrollHeight is evidence,
not clipping by itself. Brand text is also checked inside its full brand lockup,
while its own clipping boundary remains enforced. This is metric-based geometry,
supplemented by Native screenshots, rather than pixel-level OCR.

Visibility is checked after scrolling/reflow, so temporarily occluded event
tabs cannot disappear from the measurement. The baseline tab labels are14px,
giving actual14/21/28px at OS1/1.5/2. The normal regression suite reproduces the
previous visibility-before-scroll bug and rejects a1.5px painted/card overflow.

`pages.mjs` measures all24 home/event/notes/profile × scale × orientation states,
including a seeded synthetic note, rendered text, exact per-text baseline ratio,
Range glyph bounds, three tabs and overflow. DOM navigation is used for these
measurements; actual Native taps are exercised in matrix and journey. A script existing does not mean its
cases have passed: require the saved source-specific JSON and exit status.
The note list intentionally ellipsizes long title/body previews at the baseline
size. Only those two declared selectors may use a visible-preview bound, and
only after opening the real note editor, proving exact full values, title caret
start/end and actual horizontal scrolling, body wrapping or scroll reachability,
and the exact requested OS ratio in both editor controls. The fixture is not
shortened. Vertical clipping and missing full disclosure still fail the gate.

Native taps require a newly named UIAutomator dump of the correct QA package.
A nonzero dump is rejected even if stdout says it wrote a file. Observation may
retry at most3 times, each with a new path, and every failure is preserved.
The DOM hit target is checked again after observation. Native input is executed
once only, after successful bounds and hit testing; input errors never retry.

`font-regression.mjs` proves the actual Native guard's sensitivity at OS1.5:
normal root/rem24 and brand25.5 pass, a temporary inline copy of the old CSS
root multiplier produces36/38.25 and fails the same exact-size guards, then
restoring the inline style passes. It never changes WebView settings or source.
`acceptance.mjs` runs matrix/pages/journey and returns nonzero for any stage.
`geometry-regression.mjs` runs the same real Native sensor at OS2 on the header
labels and transfer badges. Four controls temporarily clip actual width or
height to1px: the same rows must retain nonempty glyphs, turn red on clipping,
and return green after restoring the original inline styles. Both the painted
metric path and conservative whole-em fallback remain subject to clipping.

`.github/workflows/android-native-parity-qa.yml` is reusable via required
`workflow_call(app_sha)` and manually via `workflow_dispatch(app_sha)`. It has
no PR/push trigger to avoid duplicate runs. Root should call it from the QA
workflow with the PR head SHA (or push SHA), after unit, and require its success
in the aggregate check. Relevant caller paths include Android, src, CSS, fonts,
index, package/lockfile, native build scripts, these QA tools/tests and workflow.
It builds a real clean Debug Capacitor APK on Ubuntu24/KVM, with a test certificate,
synthetic/offline data and actual OS font preference; it runs the Native mutation
control plus all6 matrix/24 page/8 journey checks. It stores source/tree, QA tool
source, WWW/APK/font hashes, stage outcomes, screenshots, certificate metadata,
SDK/build/device logs and the synthetic APK, also on failure. Root integrates
the aggregate; this new reusable workflow alone does not gate deployment.

SDK setup follows [Android avdmanager](https://developer.android.com/tools/avdmanager)
and the [GitHub Ubuntu24 runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md).
CI execution has not been claimed until a source-specific run completes.
The tracked Gradle wrapper has mode100644, so Linux CI invokes it through bash
without changing application files or their Git mode.

These tests do not verify real authentication, providers, push delivery,
production database permissions, real network recovery, physical-device upgrade
from Play, release signing, release speed or public availability. Synthetic server
acknowledgements must be labeled as such. Record all failures, retries and source
differences, and close only the newly created QA AVD after the run.
