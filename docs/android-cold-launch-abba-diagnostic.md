# Frozen Android cold-launch A/B diagnostic (not Native acceptance)

This is a one-shot diagnostic plan for the two QA469 FocusEvent ANRs. It does
not amend QA469, relax its 15-second foreground gate or release timeout, or
claim a renderer/ASG cause. The **application source is always**
`59b599c24341e4659bce62b02c9d78fce3dd050d`. The **tools source** is a
separate immutable commit containing this diagnostic and, after review, the v5
host cohort collector. No diagnostic workflow is installed or dispatched yet.
Root reviews the complete diff and frozen v5 contract before any push or run.
The exact branch `codex/android-cold-launch-abba-20261015` has Vercel Git
deployment disabled in `vercel.json`.

## Two fixture-only APKs

Use a clean app checkout at the application SHA, the existing isolated Native
CI AVD/SDK/Debug build recipe, private environment autoload disabled, and the
existing synthetic `prepare-fixture.mjs` and `audit-apk.py`. Build and save
**A**, the full product WWW with its isolated synthetic fixture. Then run
`diagnostic/prepare-control.mjs` only against the generated Android
`assets/public/index.html`, rebuild the same Debug native shell, and save
**B**. The reviewed `diagnostic/control-index.html` has no JS or CSS links.
Never modify tracked Java, product CSS, renderer flags, or product WWW for B.

Run `diagnostic/apk-members.mjs A.apk B.apk control-index.html manifest.json`.
Its Python `zipfile` comparison hashes every **decompressed** APK member;
the only allowed content changes are `assets/public/index.html` and the exact
signature metadata names `META-INF/MANIFEST.MF`, `META-INF/CERT.SF`, and
`META-INF/CERT.RSA`. DEX, native libraries, resources, CSS, fonts, and every
other member must match. Verify both APKs with `apksigner`; the one-shot runner
also requires the same single Debug certificate and compares the hash of each
installed `/data/app/.../base.apk` with the audited APK. Container/signature
bytes may differ and are reported with separate APK SHA256 values. Both APKs
and all reports say `fixtureOnly: true`, `nativeAcceptance: false`. No test
hook ships in a user build.

## One owned AVD, four prescribed trials

Use the same owned Android 36.1 AVD, `-gpu swiftshader` and existing renderer
flags, guest core/memory settings, and WebView provider/version throughout.
Disable real emulator networking with the existing `network-isolation.mjs` and
retain its receipt. Set portrait/rotation lock and actual `font_scale=1`
**before** the diagnostic window; the runner rechecks them and issues no
rotation or hold command. Start the reviewed v5 host cohort collector and
guest trace before trial 1. The runner refuses v4 or an absent v5 start receipt.

The fixed order is **A–B–B–A**, with a 90-second budget per trial and a
12-minute total diagnostic window. Each trial installs its audited variant,
verifies installed bytes, force-stops and clears **only** the owned synthetic
Debug package, and cold-launches MainActivity. No ANR, logcat or DropBox
history is deleted. Trial errors and ANRs are journaled; planned later trials
still run unless emulator ownership, network isolation, or a resource cap is
lost. There are no retries or selected “good” trials. Even a safety stop
retains four rows with explicit unattempted reasons. A CI wrapper must apply
the separate hard `timeout 12m` and finalize all existing trace/logcat/ANR
evidence on every exit. This budget does not change any QA acceptance deadline.

The runner records host UTC/monotonic and guest clock anchors; force-stop,
install, start, common CDP readiness, product-specific splash/native readiness,
control readiness, the original product 15-second foreground result (owned
focus plus Android Native WebView), the separate control focus result, focus/ANR changes,
and stop. Product and control readiness are separately labeled; their raw
latencies are not presented as equivalent. Guest GPU thread names are snapshots
only (`roleProven: false`). The continuously running guest trace must supply
first WebView draw and guest GPU intervals. The host journal retains
`cpu.max`, `cpu.stat`, effective cpuset, allowed/logical CPU counts,
`/proc/stat`, load and CPU pressure until stop. The v5 collector must preserve
owned emulator thread identities, counters and its own incomplete/unavailable
status. A thread name alone never proves the host ASG/renderer role. No
profiler attach, SIGSTOP, renderer change, or production I/O is part of this
trial.

`diagnostic/one-shot.mjs` requires the audited manifest, the original network
isolation receipt, an approved v5 collector start receipt, ADB/APKSigner paths,
the reviewed control index, explicit AVD/device/PID and separate app/tools
SHAs. Its output directory must be new. It writes `trials.jsonl`, capacity
samples, ANR snapshots and `one-shot.json` incrementally. The final record
intentionally remains `diagnosticComplete: false` and
`needsV5CollectorStopAndGuestTraceCorrelation: true` until Root reviews the
v5 stop receipt, original guest trace/first-draw mapping, continuous logcat,
DropBox/bugreport, host ownership and capacity, and every ABBA row. A missing
mapping is `unavailable`, never a guessed causal edge.

No production account, keys, signing/upload credential, network access,
deployment, store action or paid service is needed. This local branch is a
review artifact; no CI was run for the one-shot and no Android device result is
claimed here.
