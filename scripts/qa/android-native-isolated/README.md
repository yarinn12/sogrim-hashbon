# Isolated Android Native QA

These scripts exercise an actual Capacitor Android `.debug` APK using ADB and
its debuggable WebView. They never select the first connected device. Provide
`ANDROID_QA_DEVICE`, `ANDROID_QA_AVD` and `ADB_PATH`; the AVD name is verified
before any command. Use a newly created empty AVD, never a user's existing AVD.

This run uses `emulator-5582` / `sogrim_bf49_20261010` and a debug test certificate
created under an isolated workspace Android home. No upload/release certificate
or private configuration is used. The product's Android source is unchanged.

Prepare the normal WWW build with `SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD=1` and
`NODE_OPTIONS=--import=file:///absolute/path/to/offline-build-config.mjs`, then
run `prepare-fixture.mjs`, `cap copy android`, and offline `assembleDebug` with
the isolated Android user home. Set the release signing-properties path to a
verified nonexistent file. Verify the APK package is `com.sogrimhashbon.app.debug`
before installing. Disable AVD Wi-Fi/data before launch. Only the empty QA app's
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
native plugin readback, required selector existence, computed font sizes and
glyph/container bounds, overflow, and screenshots. It restores OS settings in
`finally` and returns nonzero for any failed/missing case or check. The standalone
`matrix-verdict.mjs` is the exact CLI verdict boundary. Normal unit tests cover
that boundary and fixture persistence/CAS/network rejection. Controlled mutation
of the verdict to always return zero proves the regression turns red.
The runner verifies actual viewport orientation after `wm user-rotation lock`
and waits for the product's CSS font readback. Each case records its own failure
and the other cases still run. Expanded transfer helpers must have visible text;
their container is opened with a real tap rather than measuring a collapsed child.

`pages.mjs` additionally measures home/event/notes/profile at all three OS font
scales, including a seeded synthetic note, essential target existence, text growth,
tab label width and app overflow. It is supplementary to the matrix's exact font
size checks, which detect multiplied scaling. A script existing does not mean its
cases have passed: require the saved source-specific JSON and exit status.

These tests do not verify real authentication, providers, push delivery,
production database permissions, real network recovery, physical-device upgrade
from Play, release signing, release speed or public availability. Synthetic server
acknowledgements must be labeled as such. Record all failures, retries and source
differences, and close only the newly created QA AVD after the run.
