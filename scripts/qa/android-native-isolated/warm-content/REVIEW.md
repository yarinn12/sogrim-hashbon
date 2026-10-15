# Inactive warm-content diagnostic preparation

This local helper set is based on `32b4d1ae44116c5090f4a13449cdba9888176dbb`.
It adds no workflow and changes no application, original 37-file c14 harness,
existing telemetry/ANR predicate, wrapper, KVM policy, timeout or trace/v5 cap.
Only Root may schedule a reviewed run. Importing helpers performs no device work;
the controller refuses unless explicitly guarded, on Linux, with a separate exact
c14 application checkout and reviewed tools SHA. It refuses existing output/trace.

The frozen application is `c14a7665e8de361d8d33be183e7a88adec3ff7cb`, tree
`9bcf8cf40144d12507faa2cfea9ddadee42d819f`. All 37 helpers are materialized from
canonical Git bytes. Only generated driver/matrix copies are instrumented.
The original font regression runs first. Then only original 100% portrait runs:
36 assertions, one separate actual 650 ms hold and its ordinary taps. The next
100% landscape row executes its original `font_scale=1` setter and 750 ms sleep.
The hook cuts immediately before its first launch. No remaining matrix or pages
prelude runs. The original matrix verdict still rejects the two-row truncation.

At the cut a snapshot and exact open-log prefix are retained and scanned with the
unchanged target ANR predicate. Missing proof or any prelude ANR blocks install.
Each fresh AVD must already have warmed with A. The controller verifies its actual
installed hash and canonical local APK against A before any warm-up.

The product/minimal-index pair readers derive from
`a60cdd7a93bc7c72a14caa270d5be76e94fb11b6`, rebound and strengthened for c14.
The minimal HTML is byte-identical to that reviewed control. A fresh pair audit
binds actual A to the original successful c14 APK asset audit/fixture tree,
215 public assets/13 fonts, and actual index/APK hashes. Every decompressed member
is compared; only index and the exact original signature-member allowlist may
differ. DEX, manifest, resources, CSS, fonts and remaining assets must match.
Both real APK signatures must verify with one identical Android Debug signer.
Synthetic normal-suite ZIP fixtures exercise comparisons only; they are not
signed or installable APKs and do not establish Native execution.

Root's future build preparation must retain A and B plus original audit/fixture
receipts, restore A to the canonical Debug APK path for original warm-up provenance,
and initially install A in every fresh AVD. No build/sign/install has been run as
part of this local preparation. Required pair inputs are
`ANDROID_WARM_PAIR_MANIFEST`, `ANDROID_WARM_PRODUCT_AUDIT`,
`ANDROID_WARM_FIXTURE_RECEIPT`, `ANDROID_WARM_CONTROL_INDEX`, `APKSIGNER_PATH`.
The audit CLI accepts A, B, control HTML, original asset audit, original fixture
receipt and a new manifest output in that order.

At the target, A is reinstalled with `install -r A` or B with `install -r B` in
exactly the same path. There is no `pm clear`. Actual installed APK hash, prior and
new app PIDs, original A/B pair and verified signer are retained. The original
500 ms force-stop sleep, am-start/connection/30-second readiness and 15-second
foreground budgets are retained. A target process-start failure is recorded and
does not invoke the original fallback retry. The warm-up keeps original behavior.
Product readiness requires its real screen/Native bridge/fontScale=1. Minimal
control readiness requires complete DOM plus the reviewed marker, with no claim
of Native/splash equivalence. The original CDP/ADB raw telemetry and late ACK
behavior remain. A page observer permits owned CDP cleanup even if readiness fails.
No target rotation or hold is issued. Original matrix finally restores settings
and rotation under a separate start/completion boundary.

The owned trace/v5 collection, ANR/bugreport collection, logcat close ACK, final
full closed-file predicate and manifests reuse the reviewed collector lifecycle.
Boot-ID/uptime probes retain quantization and whole-roundtrip bounds; broad points
remain broad, and no interpolation/host causal alignment is invented. A delayed
ANR for a warm/unknown PID makes the contrast untested. A target ANR with complete
owned raw evidence is a valid positive failure observation; the unchanged ANR
gate and actual exit still fail. `evidenceComplete`, `factorTested`, and outcome
are separate. `nativeAcceptance` and release authorization remain false.

The pure four-arm reader requires A/B/B/A, the same audited pair and distinct boot
identities; it requires A reproduction before reporting a descriptive contrast.
Installer/cache effects remain an explicit confound. It never authorizes causal
attribution. Root must also bind its wrapper's exact SDK/resources/owner/session
and all raw manifests before interpreting any future four-arm result.

The approved minimal index hash binds canonical Git LF bytes. Only checkout CRLF
conversion is normalized before writing the control or comparing its fixture;
raw fixture hash and normalization are recorded. Extra or changed content is
rejected. The canonical index remains byte-identical to a60cdd7.
