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
Privileged actions are isolated Python start/inspect/stop operations for the
verified profiler. There is no shell, sysctl, setcap or numeric-PID signal
fallback. A pidfd is acquired before final identity checks. Startup handles and
the independent fixture lease survive errors before READY/inspect; unverified
cleanup is a failure and never authorizes another workload.

Bounds: 49Hz, 65,536 map keys, 20 minute capture, shared 30s profiler startup and
15s stop budgets. Three raw streams have kernel-enforced 64MiB limits each,
below the 256MiB total raw budget; hitting a limit is a failure. These bounds do
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
