# Local preparation: original ASG host CPU diagnostic

This branch is diagnostic only. Its first creation push would start one standard
Ubuntu 24.04 job, attempt 1/run number 1, with a 45 minute job bound. There is no
dispatch, update, retry, alternate transport or release path. Root must review the
exact final commit/tree and receipts before any first push. Vercel deployment is
explicitly disabled for this branch. Nothing here clears the failed original
2d4 Native gate or authorizes a store upload.

The application, original Debug APK, signer, SDK configuration, 127 SDK ELF
reference, original ASG/SwiftShader settings and four workload stages stay pinned.
The reviewed 4fcc guest/host observer bytes stay unchanged. The full matrix,
coldstarts, pages, journey, negative font controls, geometry, both health checks,
continuous history and final ANR gate retain their original deadlines. Successful
later checks cannot erase an earlier ANR. Detailed Chromium tracing remains
unavailable; no APK, WebView, OS or guest tracing expansion is included.

Only official Ubuntu bpftrace 0.20.2 is accepted. The workflow installs that APT
package; identity receipts retain package, executable SHA/build ID, actual kernel,
BTF SHA and USER_HZ. A global `profile:hz:49` trigger runs on each host CPU. The
TGID predicate, then the leader birth check, precede the only stack read in the
independently validated exact program. It collects at most 32 user frame-pointer
instruction addresses, not raw stack bytes, kernel stacks or DWARF data. Same-TGID
future threads qualify; a fork has a different TGID and is rejected before data
collection. This global trigger has overhead even for rejected processes.

One mandatory native preflight, before the emulator, must show actual nonzero PCs
for main and a thread created after READY, no busy-fork or foreign TID samples,
and at least 250ms measured CPU work for each of main/thread/fork. Synthetic local
tests do not establish actual BPF/kernel compatibility. If the single real
preflight fails, no emulator workload follows and the partial artifacts remain.

Children get a fixed operational environment and a fresh private HOME/config,
cache, temp and Android home. Tokens, provider headers, NODE_OPTIONS and private
configuration are not inherited by the emulator, fixture or profiler. The SDK
launcher may add only verified loader directories inside its emulator root.
Privileged actions are isolated Python start/inspect/stop operations and one
fixed-argv `info` metadata query for the
verified profiler. There is no shell, sysctl, setcap or numeric-PID signal
fallback. A pidfd is acquired before final identity checks. Startup handles and
the independent fixture lease survive errors before READY/inspect; unverified
cleanup is a failure and never authorizes another workload.

Bounds: 49Hz, 65,536 map keys, 20 minute capture, shared 30s profiler startup and
15s stop budgets. Raw stdout and stderr have kernel-enforced 64MiB limits each,
below the unchanged 256MiB total raw budget; hitting a limit is a failure. These bounds do
not extend any original Native deadline. Raw output, command failures, parse
errors, explicit loss messages and unknowns are retained. Missing loss counters
are null, not zero. Full unwind, loss-free capture and lifetime mapping coverage
are never asserted.

Owned maps/public-module snapshots record duration and monotonic begin/end
times. Only SDK emulator and public `/usr/lib` or `/lib` ELF files may be read,
with matching mapping device/inode and before/after file identity and SHA. An
additional maps snapshot follows verified profiler exit, before emulator cleanup.
No foreign process inventory or process memory is read. Snapshot I/O, hashing,
readelf calls, ownership guards and profiling all add overhead; recorded durations
and profiler CPU counters permit inspection, not a zero-overhead claim.

After both the workload/emulator and profiler stop, one bounded offline Python
decoder uses those exact on-runner public files. It requires consistent before,
after and intervening mappings for each sampled time bucket, verifies current
SHA/device/inode/build ID, translates through a unique executable ELF PT_LOAD,
and uses declared FUNC/IFUNC ranges. It never assumes file offset equals ELF
virtual address or guesses the nearest symbol. Stripped, JIT, ambiguous,
unbracketed and unloaded modules remain explicitly unknown. Identical snapshots
do not rule out an unobserved unload/reload between them.

Offline limits: 25s internal/30s command bound, 8,192 hot unique PCs, 128MiB
input, 1GiB public-module bytes, 500,000 symbol entries per module and a bounded
overlap search. Checkpoints preserve partial output. A decoder command/limit
failure fails technical acceptance separately from capture quality. Successful
processing may still have no resolvable functions. No symbols are downloaded.
No guest/host causal clock calibration, transport comparison, exclusive cause,
application exoneration, Native acceptance or release acceptance is claimed.

Run local focused controls with `node --test tests/androidHostProfile.test.mjs`.
Three Python suites execute inside Node wrappers and must not be double-counted.
The normal `npm test` inventory includes the wrapper and all these controls.

The original f101 run42303711330 stopped before any emulator or sampling:
nonprivileged bpftrace0.20.2 `--info` returned exit1 because it requires root.
That is a metadata invocation defect, not evidence of unavailable kernel/BPF
support. This new `codex/android-host-profile-info-2d4-20261107` branch routes only
that query through the existing guarded root helper, with fixed argv
`[/usr/bin/bpftrace, --info]`, the same tool SHA/environment/config/target checks
and the original startup budget. The exit-zero requirement and mandatory actual
scope preflight remain. The recorded failure is a normal-suite regression
fixture. No scope, workload, renderer, system setting or acceptance gate changes.
The original workflow file is inherited unchanged and matches only its consumed
old branch. The new workflow has a separate path/identity so its first run must
also be number1/attempt1. No new first push or cloud execution is yet authorized.

The subsequent24c run42306800042 passed privileged `--info`, then stopped at the
unchanged30s startup bound before any emulator or CPU-work preflight. Its77byte
raw file contained READY and STOPPED together at close; sample count was0.
The exact official0.20.2 source selects an independent `std::ofstream` for `-o`,
while `-B line` only calls `setvbuf(stdout,...)`. The printf callback calls
`message(...,false)`, whose TextOutput path writes without endl/flush. A short
READY can remain buffered in the separate file until process exit. Original
artifacts and failures remain preserved; actual READY emission time was not
measured. Sources: [main](https://raw.githubusercontent.com/bpftrace/bpftrace/v0.20.2/src/main.cpp),
[printf callback](https://raw.githubusercontent.com/bpftrace/bpftrace/v0.20.2/src/bpftrace.cpp),
[TextOutput](https://raw.githubusercontent.com/bpftrace/bpftrace/v0.20.2/src/output.cpp).

This new `codex/android-host-profile-stdout-2d4-20261107` branch removes only `-o`
and inherits the existing private output file as bpftrace stdout. Before exec,
the root helper requires FD1 and the path to match the pinned device/inode,
runner ownership,0600 mode and regular-file type, requires writable/non-CLOEXEC
flags, then rechecks the path. The binding is retained in the existing owner
ticket and independently checked again immediately before exec. Info/inspect/
stop retain their bounded metadata pipes. No shell or generic output fallback.

The normal regression drives the actual command/stdout-opening helpers through
an owned synthetic child that models those upstream buffering semantics. OLD
fails because READY is invisible while the child lives; FINAL observes READY
before exit and retains raw records after owned close. This is a source-backed
I/O model, not execution of the real C++ bpftrace binary or BPF on Windows. FD
negative controls reject wrong device/inode, owner/mode/type, swapped path,
read-only/CLOEXEC descriptors and the old separate-ofstream argv before exec.

The existing startup/fixture/stop/capture budgets, actual future-pthread/busy-fork
scope preflight, original APK/SDK/ASG/SwiftShader and full Native workload remain
unchanged. The third workflow path has its own first run1/attempt1; both consumed
workflow files remain unchanged and match only their old branches. No new cloud
or first push is authorized before Root verifies the frozen local handoff.

The original stdout run42310518170 passed the real BPF scope preflight:195
samples, main and a later pthread observed, busy fork excluded, identity and
cleanup verified. It then stopped before emulator launch at the unchanged
original ADB helper, because the QA command environment omitted RUNNER_TEMP.
The helper also requires both Android homes and the vendor key to share
RUNNER_TEMP/android-native-home. No emulator/application measurement occurred.

This env branch builds QA RUNNER_TEMP from the existing private profile root.
Android user/emulator homes and adbkey now use that root/android-native-home;
HOME, config/cache and temp remain private. The privileged helper independently
reconstructs the same operational values. Only original QA commands receive
RUNNER_TEMP; emulator, profiler and scope-fixture environments remain separately
allowlisted and do not inherit credentials. Original ADB key/port guards stay
unchanged. The normal regression uses the real original helper with a synthetic
SDK boundary, actual temporary RSA key-pair validation and existing-key refusal.
OLD reproduces the recorded missing-temp failure; FINAL completes that boundary.
All original APK/SDK/renderer/workload/deadlines remain unchanged. This separate
first-created workflow still needs actual cloud acceptance; it is not a release.

The env run42313212890 passed ADB key preparation, boot, network isolation,
launcher preparation, pre-health, renderer verification and trace startup. It
stopped before the original workload because the emulator's initial environment
had SDK-added keys outside the original two-loader-key model. Unknown values
were not logged. This is not an application or ANR acceptance result.

Official launcher source (main-emulator.cpp, emu-master-dev) explicitly sets
ANDROID_EMULATOR_WRAPPER_PID to its own PID, MESA_RGB_VISUAL to `TrueColor 24`,
and LC_ALL to C. These source-documented operational values
now have narrow validation: wrapper PID must equal the owned emulator PID,
visual selector must match exactly, and only C or the original C.UTF-8 locale
is allowed for the emulator. Profiler/fixture environments keep their original
strict locale. Existing SDK loader paths stay confined to the verified SDK.
The privileged helper independently repeats these checks. Any other key is
rejected; error metadata includes only bounded key names, never their values.
The source-derived regression reproduces the rejected SDK additions and checks
foreign PID, changed visual/locale, credentials and preload rejection. It is not
a capture of the original process environment or proof of binary/source identity.
All sampling, original workload and time limits stay unchanged.
Source: https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/emulator/main-emulator.cpp


The SDK-env run42315456906 stopped before original font/acceptance/geometry
workload execution with an unexpected XDG_RUNTIME_DIR key. Only its key name was
recorded; its original value was not captured. This was not an app acceptance.

Official emu-main-dev launcher source supplies XDG_RUNTIME_DIR only when absent.
On Linux, when it is already set, it also sets ANDROID_EMULATOR_DISCOVERY_DIR to
that same value. Construct both keys explicitly as private-root/runtime and
create that directory with mode0700. Do not accept /tmp or inherited user config.
The privileged helper independently reconstructs the same paths and confines
them to the private root. All unknown keys and changed values remain rejected.
Node and privileged-helper regressions reproduce OLD rejection and check FINAL
acceptance plus rejection of global/foreign runtime and discovery directories.
This is a source-derived model, not proof of exact installed binary/source
correspondence. Original app/APK/SDK/renderer/workload/time limits stay unchanged.
Source: https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-main-dev/android/emulator/main-emulator.cpp

The original runtime run42317759888 completed all app checks without a target
ANR, but its profiler result failed. bpftrace printed failed/empty user stacks
inline as `@samples[second, tid, ]: count`; the parser only recognized multiline
stacks. Preserve these rows and their weights as unknown instead of discarding
the entire parsed profile. The normal regression uses selected verbatim records
from that original raw stream and also checks CRLF and malformed/oversized maps.
Unparsed data, helper warnings, missing drop counters and incomplete unwinds keep
their original failure/partial semantics. This parser correction is not an
accepted cloud profile, Native acceptance or an ANR fix. Removing parsed spans
uses forward gaps so processing the preserved stream does not repeatedly copy
the unchanged warning prefix. No new sampling or process-memory access is added.
