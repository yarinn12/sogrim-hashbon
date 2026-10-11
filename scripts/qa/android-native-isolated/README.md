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
### Fresh CI ADB authorization

The failed 3d218a6 CI artifact showed emulator 37.2.12 booting in 49.839s,
followed by `device unauthorized`: no emulator private key was available before
the first userdata image was created. This is an authorization bootstrap failure,
not a slow OS boot or an application failure.

The workflow explicitly shares `ANDROID_USER_HOME`, `ANDROID_EMULATOR_HOME` and
`ADB_VENDOR_KEYS` under `RUNNER_TEMP/android-native-home`. Before the first emulator
launch, `adb-key-preflight.mjs` generates a new test key with the actual SDK,
verifies the private/public RSA pair, and starts a fresh ADB server with the same
environment. It first refuses an already occupied server port; it never kills an
unknown server. The CI server remains on port 5037. The driver and all ADB clients
inherit the same loopback socket and key environment, with no serial/path changes.

Use the canonical `ADB_SERVER_SOCKET=tcp:5037`, without `-a`. ADB recognizes the
empty TCP hostname as local and starts its default loopback listener. The numeric
`tcp:127.0.0.1:5037` form is classified as remote by ADB and prevents auto-start
(exit255 in Linux CI). A real SDK isolated-port check reproduced the numeric-host
failure, then started/read/closed the server successfully using `tcp:15037`.
SDK failures now retain bounded stdout/stderr with private PEM blocks redacted.

Only paths, public-key fingerprint and preparation status enter the diagnostic
receipt. Private keys remain outside the uploaded artifact paths. ADB authentication
stays enabled. A local key/signature test is distinct from actual Native acceptance;
the latter still requires the same real boot and Native gates to pass in CI.

## Wait for the real network teardown acknowledgement

On source 10a1760 the actual SDK preflight and authenticated emulator boot passed
(68.424s). The airplane/Wi-Fi/data disable commands succeeded, but the immediately
captured connectivity dump still named default network 100. OS logcat recorded
its disconnect less than one second later. A one-shot grep therefore failed
before APK install or Native acceptance, even though the requested teardown was
in progress.

`network-isolation.mjs` first verifies the exact owned AVD name, executes each of
the three disable commands once, then polls only OS readbacks for up to 30s. It
requires airplane mode 1 and exactly one current `Active default network: none`
header, rejecting contradictory defaults and historical matches. Each SDK
observation has its own timeout capped by the remaining polling deadline. Failed
disable commands, exited launchers, unknown states and persistent networking fail
closed. The receipt preserves attempts and the actual final connectivity dump.
This gate does not retry user input, change ADB authentication, or relax Native
font, clipping, IME, save acknowledgement or relaunch checks.

## Reject core emulator crashes before accepting Native results

The bcfbbc9 CI network gate passed on the real OS after two readbacks. Native
font measurement then stopped at its first `settings get system font_scale`
with Broken pipe32. Actual logcat showed two SurfaceFlinger/RegionSampling
SIGABRTs in GoldfishMapper::readFromHost: the guest lacked ReadColorBufferDma.
Core services disappeared afterward. This is a real graphics/system crash,
not a font measurement failure or a harmless read to retry.

CI installed emulator37.2.12, whereas earlier local Native acceptance used36.3.10.
The SDK now documents `swiftshader_indirect` as deprecated since36.4.9. CI uses
the supported `-gpu software` selection without changing the API36.1 Play image,
display, OS font settings, application source or native acceptance assertions.
Its real Linux before/after must be established by the next coordinated CI run.

`emulator-health.mjs` verifies the exact owned AVD before reading actual logcat.
It refuses missing evidence and core mapper assertions, SurfaceFlinger/system/
zygote fatal signals or crash dumps, even if the OS later recovered. SDK failures
remain failures with no retries. The workflow requires this gate before and after
Native acceptance; receipts retain the source and fatal lines. No product input,
ADB authorization, clipping tolerance or font ratio guard is bypassed.

Core process names are exact: `zygote` and `zygote64`, excluding `zygote6` and
longer lookalikes. Java `system_server` crashes are also rejected from the actual
`AndroidRuntime` core-fatal marker, which AOSP RuntimeInit writes at ERROR level,
without requiring a libc signal. WARNING messages, other tags, and ordinary
application `FATAL EXCEPTION: main` records do not count as this core-system gate.

## Require the host DMA capability before Native acceptance

Source4e77 reproduced the same two SurfaceFlinger aborts with supported
`-gpu software` (Lavapipe plus swangle). GPU selection alone did not provide
the guest's required `ANDROID_EMU_read_color_buffer_dma` extension. The new
health gate correctly rejected the crashes before any Native font acceptance.

[AOSP gfxstream render control](https://android.googlesource.com/platform/hardware/google/gfxstream/+/04d0287b04f72d908c621a919fa2ea5c563b1a66/host/render_control.cpp)
advertises that extension only when both `GlDirectMem` and
`HasSharedSlotsHostMemoryAllocator` are enabled. These are supported host feature
names, unlike a hypothetical standalone `ReadColorBufferDma` command-line flag.
[AOSP emulator feature initialization](https://android.googlesource.com/platform/external/qemu/+/f0c183f1cc7456ecd6f3607f2f47893768ae4334/android/emu/feature/src/android/featurecontrol/FeatureControlImpl.cpp)
applies explicit `-feature` overrides before renderer initialization. Its host
default has `GLDirectMem=off`, while the API36.1 guest requires/supports it.

Launch now requests only these two prerequisites and enables verbose SDK logging.
`renderer-capabilities.mjs snapshot` first records actual installed host/image
revisions, config hashes and these protocol defaults. It refuses a guest that
does not support GLDirectMem. After owned boot and the before-health gate,
`verify` requires one actual gfxstream readback per prerequisite, both enabled,
and the same prepared SDK/source/AVD and live launcher PID. CLI request text alone,
missing/disabled/duplicate runtime readbacks, or later recovery cannot pass.

This is a QA compatibility candidate. The real Linux fix is verified only after
the exact new source passes both health gates, all6 OS font/orientation cases,
all24 page samples, all8 actual IME/write/relaunch checks, the stacked-font
negative control and all4 clipping controls. Local synthetic protocol tests and
the SDK receipt are not substitutes for that run. No log clearing, ADB retries,
guest protocol disabling, Native getter or application change is introduced.
# Font control diagnostics

The fault changes the sole actual `html.dynamic-type-active.dynamic-type-android`
stylesheet rule from `16px !important` to the original product defect,
`calc(16px * var(--android-font-scale, 1)) !important`. It refuses absent,
ambiguous or unexpected guards and any existing inline root font override.
Root/rem/brand must all reject the stacked scale, while the fixed-pixel probe
keeps one OS scale. Actual rem and brand text ranges must grow. Restoration
checks exact stylesheet bytes, CSSOM rules and unchanged root inline state,
then requires all fonts to return to the baseline. Matched/computed font rules
are collected through the owned WebView CDP; no CSS/Native source is edited.

The immediate root/rem/brand negative-control assertions remain authoritative.
Additional frame 0/1/2 observations record computed and authored font sizes,
transition properties, active animations, visibility and reduced-motion state.
They do not retry or replace a failed measurement. After a failed control, the
original root style is restored and the same diagnostic records recovery;
recovery does not make the acceptance result pass. This instrumentation is for
the unresolved Linux AECB control failure, not a verified font or timing fix.
# Authored typography contract after 9e96d41

`font-contract.mjs` uses fixed expectations from the published CSS, selected by
actual viewport, `(pointer: coarse)` and settled Dynamic Type class readbacks.
It never derives a baseline from the font being tested. Native system scale is
still applied exactly once with the existing 0.2px tolerance. Ordinary noncoarse
tabs are13.5px, and the relocated utility spans inherit11.5px normally/16px at
AX size. Coarse pointer rules deliberately use14px tabs and24px portrait/20px
short landscape headings; other authored headings switch between28/32 at AX.
Unmapped page text keeps its independent OS1.0 baseline comparison.

The original failing run38092857710/artifact11684439565 stays FAIL. Its font
fault and eight Native journey checks passed, while matrix/pages failed and
four clipping controls/after-health never ran. Independent desktop replay of
the exact APK CSS and13 fonts explained36 font observations, but is not Native
acceptance or proof of the Native pointer media state. The next full SDK run
must record those actual media readbacks and matched/inherited CSS rules, then
pass all6/24/8/font/four clipping/before-after health and packaging gates.

`tests/androidNativeFontContract.test.mjs` rejects the obsolete fixture bases,
wrong AX promotion, stale/missing layout readbacks, frozen text, extra OS zoom
and a0.21px size mismatch. Existing words/glyph overflow/Native control counts,
tap/payload/ack/relaunch and exact font-fault restoration guards are retained.
# Rotation requests follow actual Activity readiness

On public source `41748f7`, run `38096563715` recorded a real OS rotation
`0 -> 1`, followed by `am force-stop`, the foreground launcher requesting
orientation `5`, and a real rotation `1 -> 0` while `userRotation=1` remained.
The matrix OS2 landscape and pages OS1/1.5 landscape viewport guards correctly
failed. Missing normal landscape baselines also caused downstream ratio checks
to fail; those are not evidence of a second font multiplier.

`orientation.mjs` launches the QA Activity first, observes its actual focused
Native window, and sends exactly one `wm user-rotation lock` request. It requires
the actual OS lock/settings, the actual default display rotation/current bounds
and the actual Native WebView viewport to agree. Display0 parsing reads its
current `mRotation` and `cur=` bounds, separately from `mUserRotation`; missing
or ambiguous display evidence fails. Raw display dumps accompany observations.
The original 15s matrix and 12s page budgets cover foreground and orientation
readiness together. Failure receipts retain focus, OS settings and viewport
observations and `dumpsys window displays`.
The helper does not override application orientation policy or retry an input.

Permanent boundary regressions model the recorded launcher reset, reject a
successful shell command with the wrong viewport/OS readback, and reject a
foreign or non-Native foreground. Their controlled RED/GREEN evidence is tool
validation. Full Native acceptance still requires a new exact-source SDK run
with all6/24/8, font and clipping controls, both health gates and artifact audit.

## Read foreground ownership from actual Display0 on API36.1

Exact source `4acd8b3`, run `38098916803`, retained real API36.1 display dumps
containing the owned QA Activity in Display0 `mCurrentFocus`. The helper looked
for that field in `dumpsys window windows` and recorded empty focus in all12
matrix/page orientation attempts; they failed before any rotation input. The actual
`mRotation`/`cur` parser succeeded; this was a foreground observation schema
error. Original source4acd acceptance remains rejected with0 matrix checks and
0 page samples; the separate journey passed8/8. Clipping and after-health did
not run.

Foreground ownership now comes from exactly one `mCurrentFocus` field scoped
to the same actual Display0 dump used for rotation and physical bounds. Focus
from another display or `mFocusedApp` never substitutes for current window
focus. Missing/ambiguous focus retains raw evidence and a parsing error, and
fails before rotation. Existing Native/foreground/OS-lock/viewport guards,
single-input ordering and original time budgets remain unchanged.

`tests/fixtures/android-native-api36-display0.txt` is the unmodified first
actual display observation from the digest-verified4acd matrix artifact:
ZIP SHA256 `9f5320f75f18aa6c19e11c126f6fb7cb0df536d6a9405f80240942bcca46f106`;
raw UTF-8 SHA256 `8f0639c2aa6dc1632d9c4646b225bfbc32afb95d39dfd02db0a1a8832b69e60f`.
Its fixture attribute preserves LF and emitted blank EOF lines on all hosts.
A controlled boundary
test with this exact display dump and the recorded empty focus-listing result
fails with the old helper, then passes with the corrected helper. Exact raw
windows-listing text was not retained by that failed helper. These are local
regression controls; complete Native acceptance still requires a fresh SDK
run on the next combined exact source.

One4acd page attempt also recorded an actual ANR window (OS1.5 portrait),
while `mFocusedApp` still named MainActivity and CDP remained available. The
second frozen fixture `android-native-api36-anr-display0.txt` has raw SHA256
`e708aa23f1314e87f90c5ffbbec8293bbd1d7bb6245db7b974bfe71b55d5241c`.
Its regression requires rejection before rotation; an owned focused app or
responsive WebView must not substitute for the actual current window. Logcat
records an input-dispatch focus-event timeout at00:45:48 UTC and also a GMS
broadcast ANR earlier in the run. The full Java/native ANR stack file was not
retained, so the app/system root cause remains unresolved; this schema fix
does not claim to repair that separate Native ANR.

## Preserve and gate the entire Native-run ANR history

CI starts explicit-device `logcat -b all -v threadtime` before the first Native
acceptance launch and retains the continuous file through cleanup. A later
force-stop/relaunch cannot remove an earlier target-app ANR from the gate.
`anr-diagnostics.mjs` verifies the owned CI AVD before reading diagnostic data,
captures last-ANR and full `data_app_anr`/`system_app_anr` DropBox entries, and
requests a bounded180-second `adb bugreport` ZIP on failed runs or a recorded
target-app ANR. Foreign events remain recorded without target attribution.
Commands, failures, raw text, ZIP hash and collection times are saved.
Missing/invalid continuous history or incomplete collection fails the gate.

The gate rejects target app events from ActivityManager, WindowManager and
the events buffer; foreign app events remain in raw evidence with separate
attribution. Continuous history and the final all-buffer snapshot are checked
before the owned emulator is killed. Cleanup retains a nonzero diagnostic/ANR
status, stops the owned AVD, then fails the job. Existing glyph/font/journey,
health and source/APK requirements remain in place. Collecting a report or
rejecting a dialog does not resolve the historical4acd ANR; its root cause is
still open until exact PID/time/phase thread evidence or a faithful cause proof
is obtained.

## Diagnostic scheduling trace around cold launches

`trace-diagnostics.mjs` starts before the font fault and acceptance cold launches
on the owned Linux CI AVD. It requests guest scheduling, process identity,
gfx/view/window/input atrace and SurfaceFlinger FrameTimeline data. The actual
Perfetto version/help, registered provider names and toybox tools must be read
successfully; an absent provider/tool prevents startup and remains an explicit
error. Advertising a provider does not prove its events or interval coverage.
The name matcher follows the first table column emitted by the primary
[Perfetto CLI implementation](https://github.com/google/perfetto/blob/main/src/perfetto_cmd/perfetto_cmd.cc)
(`PrintServiceState`), with a synthetic table-format regression. Human query
output is not a stable machine protocol; unexpected formatting fails explicitly
and retains raw stdout/stderr for review. No actual API36.1 query output has yet
been captured by this new helper.

The host observer reads only the explicitly supplied emulator PID and its
`/proc/PID/task` entries. Both command-line AVD/port and process start ticks must
match; there is no PID search or fallback to a different process. Linux's
launcher execs the architecture-specific QEMU engine with the same arguments;
the observer accepts either binary name but still checks actual ownership.
It samples main, renderer/GPU and vCPU counters every1second, recording thread
identity, CPU ticks, scheduler runtime/runqueue delay and available wait channels.
Unusable counters fail collection; unavailable kernel wait channels and vanished
tasks remain enumerated. This is not a host stack profiler and cannot alone name
the ultimate renderer call, lock owner or shared host resource.

Cleanup runs on failure before the existing ANR collector and owned AVD shutdown.
The host observer stops cooperatively even if guest ownership is lost. For guest
finalization, a toybox inotifyd watch must be registered on the exact trace inode
before signalling the exact Perfetto PID, whose command/path/start ticks are
rechecked. A matching `close_write` event with unchanged inode is required before
the pulled file may be called transport-complete. PID exit, a successful signal,
nonempty bytes or valid protobuf framing alone are insufficient. This follows
the [official background tracing procedure](https://perfetto.dev/docs/learning-more/tracing-in-background).
Partial files and failures are retained for diagnosis. The watcher cleanup checks
its own child PID, parent, unique path and start ticks; it never signals a global
Perfetto process or another emulator. Missing finalization still fails explicitly.

Diagnostic limits are separate from acceptance budgets: 32MiB Perfetto buffer,
5second drains, 512MiB trace file, 64MiB host JSONL and20minutes maximum recording.
The job remains45minutes, so reaching a diagnostic cap before cleanup is explicit
incomplete coverage, not a successful full-job recording. The guest close watch
has2seconds registration and6seconds event polling inside a15second guest timeout
and20second host command limit. These do not extend app foreground, launch,
orientation or ANR deadlines. No renderer, core count or AVD memory is changed.

Each host sample retains read/scanned/selected-thread counts and measured sampling
time. Its summary retains observer CPU microseconds, RSS, elapsed time, peak thread
counts, byte/hash receipt and unavailable-field counts. Actual SDK overhead has
not yet been measured; the observer and guest ftrace can perturb scheduling.
Native acceptance must still pass all original font/geometry/history/health gates.
`nativeAcceptance` is always false in these diagnostic receipts.

`captureComplete` means acknowledged diagnostic transport only. The bounded
protobuf check rejects empty, text, truncated and metadata-only files; it does
not validate semantic coverage or losses. Before drawing a cause conclusion,
use Trace Processor on the real trace to verify parser/ftrace/buffer-loss stats,
clock mapping, sched_switch/waking data, target main/RenderThread/GPU identities,
SystemUI/SurfaceFlinger/ranchu tracks, requested FrameTimeline events and coverage
from each cold start through its ANR. Missing events, clocks or overflow are
unavailable evidence. Host/guest UTC correlation and real stack/lock ownership
remain analysis work. This instrumentation has only synthetic boundary tests
until a coordinated exact-source Linux SDK run supplies actual evidence.

Successful logcat/DropBox reads may themselves contain historical system
permission warnings. On exact source ae8ca15, the final all-buffer read returned0
with valid threadtime data, but four recorded DisplayManagerService warnings
were incorrectly treated as failures of the reading command. These exact API36.1
lines are frozen in the regression fixture. Command exit/error, diagnostic stderr
and a plain command-error first line still reject collection; every final logcat
read must also contain actual threadtime protocol. Empty/malformed final output
cannot borrow success from earlier healthy continuous history. Historical data
remains unmodified and the complete target-app ANR gate still rejects an incident
after recovery. The original ae8ca15 cleanup failure and historical4acd ANR remain
preserved; this tooling correction requires a fresh exact-source SDK run.
