# Inactive one-shot warm-content integration

This integration is local only. Root retains sole scheduling and push authority;
Root and QA must review the final immutable source before any actual CI run.
The workflow listens only to the separate `codex/android-warm-content-abba-20261016`
namespace with exact workflow-ref/repository/push/run-1/attempt-1 guards and
read-only contents permission. The integration branch does not match this trigger.
There is no global concurrency lock or dependency on TestFlight/iOS work.

The reviewed helper preparation remains `509402bcf74e46317540b2903446e5b2f626e876`.
Root's test-only `6b90df6533f89e96609fc7dac4004309be40701a` was cherry-picked with
its original identity in the commit message. The old pages-restart workflow/arm
runtime and all original 37 c14 helpers remain unchanged. New KVM tests exercise
the new actual warm-arm caller and SDK launch, as the Root regression does for
the old arm. Removing the actual grant or caller must fail those regressions.

One frozen c14 product A APK is built once. The exact reviewed minimal index is
used for a second build B; the decompressed pair audit permits only the approved
index/signature-member differences, including identical DEX/resources/CSS/fonts.
The original A APK and generated index are restored before canonical re-audit.
Actual package/version and both Debug signatures are verified. No application
data is cleared after warming; all four fresh AVDs initially install/warm with A.

Before the ADB key/server preflight, the master proof verifies actual c14 HEAD/tree,
all 37 canonical helper blobs, actual tools HEAD/tree and working bytes, original
A audit/fixture/215 assets, 204 raw Git assets/13 fonts, the exact one-build A/B
paths and hashes, actual Debug signer, and actual SDK ELF/launcher/JAR files,
metadata, guest kernel/ramdisk/system/vendor and platform-JAR hashes, and executable
version protocols. Large image files are hashed in bounded chunks and changes
during hashing fail; original capture caps and foreground budgets are unchanged.
Ready JSON or a filename alone is
insufficient. Command stdout/stderr are retained. The stable SDK comparison uses
actual file hashes/metadata and parsed versions; raw temporary crash-log paths
are preserved as observations rather than compared as version identity.

Every arm records a master-input entry proof before creating its worktree, then
another proof against the real fresh c14 checkout/canonical A APK before any SDK
AVD creation or device launch. It repeats the proof after owned teardown, comparing
the same A/B hashes, signatures, audit/fixture/control bytes, SDK and tools with
the original master proof. The workflow repeats the comparison after all four
arms. No APK is rebuilt between arms. Path guards use real regular files contained
in the declared actual build/SDK roots; nonexistent, symlink/escape, empty, fake
SDK and forged canonical-source inputs fail.

Order is A/B/B/A, one fresh worktree and owned AVD each; emulator-5582, 2 vCPU,
4096 MiB, original SwiftShader/Gfxstream/ASG and exact feature/buffer settings.
Per-child, boot, foreground, command and original guest/host trace caps remain
unchanged. The outer 120-minute job cap matches the prior four-arm wrapper.
KVM effective access is re-established immediately before each actual SDK launch,
with user, device inode/mode and before/after ACLs plus the real SDK accel-check
retained. There is no software CPU fallback, timeout extension or retry.

The controller runs original font controls, only the original 100%-portrait case
(36 assertions/one hold), then the original next font setter and 750 ms. At the
cut it installs A or B symmetrically, without pm clear, rotation or target hold.
All existing raw CDP/ADB, late ACK, closed-tail ANR predicate, boot-ID clock,
trace/v5 and original settings restoration behavior remain in the reviewed helper.
Product Native and minimal-control readiness stay distinct. A target ANR with
complete evidence remains a positive failure observation and exits failing;
prelude ANR, missing proof, boot/owner/capture failure makes the factor untested.

The EXIT trap is installed before input proof or source setup. Raw evidence starts
inside the uploaded build tree and the source artifact path links to that owned
directory during the run. It is archived even if manifest or post-input proof
fails. Final manifest creation follows owned emulator teardown and records its
own failure independently; it excludes only itself and the later wrapper-exit
receipt. Original diagnostic and wait/input/manifest exits are retained.

Teardown may signal only the reverified original emulator child. An exited child
is safely reaped even after /proc owner identity disappears, retaining its failed
exit. A live missing/foreign owner or unclosed child writes an unsafe-session
receipt; later planned arms preserve failed prefixes without opening a new AVD.
A valid positive-failure arm continues to the next fresh session. The outer loop
records every planned arm and aggregates every failure, including the final proof.

Offline tests execute actual Bash cleanup, manifests, setup proof callers,
ABBA loop and KVM caller boundaries against labeled synthetic dependencies.
Separate real-file/source/default-SDK guards reject fake proof paths; synthetic
fixtures are not actual SDK, APK or device acceptance. Actionlint, Bash syntax,
focused, normal and architecture receipts belong to the exact final commit.
No workflow, device, SDK command, API, store or public release is activated by
this preparation or by a passing local test. Native acceptance remains false.
