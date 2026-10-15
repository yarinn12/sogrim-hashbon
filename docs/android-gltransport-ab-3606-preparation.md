# PIPE / ASG diagnostic preparation

Frozen preparation for Root review. No push, workflow activation, Native execution,
store action, release signing or product change is part of this preparation.
The push-only workflow would activate on the first push to the named experiment
branch. Root must review the exact control commit before authorizing that push.

## Fixed inputs and single treatment

Application and original Native tools: `3606feae297326fcd89a963cc3994499f6a8e696`,
tree `3e84e7d2b8615689e69ac7590e973667aa464b17`.
Runner reused from `1c86a9d2635fc8670e854bdceb41bc88ff0291f6`.
`provenance.json` records five byte-identical lifecycle helpers and their SHA256.
The executor and policy are explicit adaptations; no runtime source rewriting.

| Control | Both arms |
|---|---|
| Host | One Ubuntu 24.04 job, sequential A then B; no simultaneous emulators |
| Emulator | 37.2.12, build 16428233; SDK metadata hashes and full between-arm file digest |
| Image | `system-images;android-36.1;google_apis_playstore;x86_64`, revision 4 |
| Renderer | `-gpu swiftshader`, gfxstream, GLES 3.0 SwiftShader, Vulkan inactive |
| Features | `GLDirectMem,HasSharedSlotsHostMemoryAllocator`, both acknowledged |
| Effective path | Minigbm=0 and VirtioGpuNext=0; no feature override added |
| AVD | Separate fresh named data directories, source clones and result directories |
| Resources | 2 cores, 4096 MiB, 1080x2400, density 420, pixel_6, cameras off |
| Buffers | writeBufferSize 1048576, writeStepSize 4096, dataRingSize 32768, drawFlushInterval 800 |
| APK | One `assembleDebug`, one seal, same SHA256 and installed bytes in A and B |
| Treatment | A: `hw.gltransport=pipe`; B: `hw.gltransport=asg` |

All other AVD config values are compared after replacing the exact owned AVD name.
Only `hw.gltransport` is excluded from that equality check. Buffer settings are
left at their existing defaults and verified in the effective emulator log.

One separate disposable build clone uses the original source3606 build commands,
synthetic bootstrap, APK asset audit and default ephemeral **Debug test certificate**.
There is no upload/release signing or private credential access. A nonexistent
explicit signing-properties path and disabled private-env autoload are required.
The immutable application/tools checkouts remain clean. Audit, fixture, certificate,
build observation and APK hashes are sealed together and verified before seeding
each arm; an installed APK is pulled back and compared to the same seal.

## Support and effective selection evidence

The official exact build archive is
<https://dl.google.com/android/repository/emulator-linux_x64-16428233.zip>.
Only its central directory and two text members were fetched during preparation.
No SDK was installed or run locally. Their SHA256 values match the actual retained
SDK from the previous diagnostic:

- `emulator/lib/hardware-properties.ini`: `13a89cc7cfa84c5fe48cd7eb8d296bca321dcd0d90f7bcb751efd963ae2c653d`
- `emulator/source.properties`: `ba13085f647fb8389a4d06a1de0e4104ac4e841733e50f67223ac230e1ce685a`

The exact schema declares `hw.gltransport` with the `asg` enum option. The runtime
must match that same schema hash and enum before either AVD is launched. It must
also retain both original DMA capability and strict SwiftShader selection checks.

After boot, the executor requires consistent effective host `hw.gltransport`,
`androidboot.hardware.gltransport` and `androidboot.qemu.gltransport.name` values.
It reads the actual owned guest's `ro.boot.hardware.gltransport` and
`ro.boot.qemu.gltransport.name`, rejects a conflicting legacy property, and requires
the original emulation/ranchu EGL/gralloc path. It verifies emulator PID/startTicks
around those ADB reads. Missing, conflicting or overridden values fail the arm
before font regression or acceptance. No retry or alternate transport is selected.
Raw command evidence and the failed selection receipt are retained.

Primary reference code maps the guest properties to the PIPE / address-space
connection choice. This is selection evidence; the test does not instrument every
GLES command or establish that ASG fixes an ANR. The exact image's guest binary has
not been mapped to a complete reproducible source revision. The receipt explicitly
records `streamExecutionProven: false`; do not describe it as a per-command trace.

Primary references:

- [Host hardware schema](https://android.googlesource.com/platform/prebuilts/android-emulator/+/master/linux-x86_64/lib/hardware-properties.ini) — reference only; the exact archive above supplies the actual version proof.
- [Host transport override handling](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-emu/android/main-common.c)
- [Host guest boot-property generation](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-emu/android/userspace-boot-properties.cpp)
- [Guest property mapping and stream creation](https://android.googlesource.com/device/generic/goldfish-opengl/+/a24d1a13e7c6eca9b57a35cdd5fe5e3ac50ec103/system/OpenglSystemCommon/HostConnection.cpp)
- [GLES guest/host transport architecture](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-emugl/DESIGN)

## Original gates, ownership and stop conditions

The original source3606 matrix, pages, journey, font regression, geometry regression,
network isolation, health, trace and complete ANR-history scripts are unchanged.
The current pre-install Launcher preparation is retained. The old A/B phase order,
four independent finalizers, command budgets, 240-second initial boot wait and
180 one-second boot observations remain. There is one attempt per arm and a
45-minute job ceiling. First run number/attempt only; no manual dispatch or rerun.

The runner uses the existing one exactly owned ADB server and isolated key home;
only that server/key is shared by the two arms. AVD data and app state are separate.
PID/startTicks, exact SDK executable, AVD name, device serial and socket role guard
ownership. KVM access is granted only to the current numeric CI uid for the same
verified character device. A's emulator closure and free ports are required before
B can start. Missing or reused ownership never causes adoption or broad cleanup.

A failed measurement prevents later measurements in that arm. Trace finish, ANR
history, owned cleanup and evidence retention are attempted independently. A later
pass cannot replace a failed phase or erase an earlier ANR. Failed, missing,
interrupted, unsupported and mismatched arms remain failed/incomplete diagnostics.

## Interpretation and remaining risks

- One fixed order, one attempt and shared host caches/load do not establish
  causality. A and B can experience different scheduling or thermal/cache state.
  Across-machine or later-run comparisons add host variation and cannot be paired
  as an otherwise identical control. Do not rerun selectively to obtain green.
- A freshly provisioned hosted runner may no longer supply the exact emulator or
  image bytes. SDK/hash/version mismatch must stop; there is no upgrade fallback.
- ASG may be unsupported by this guest driver despite host schema support, or may
  produce a different failure. Failed boot/property checks are valid red evidence.
- Guest driver source equivalence and per-command stream execution are unproven.
  Runtime property agreement must not be overstated as complete transport tracing.
- Building once plus two full Native runs may hit the unchanged 45-minute ceiling.
  Such a result is incomplete, with best-effort finalization and retained artifacts.
- Synthetic fixtures and software rendering do not verify real push, production
  synchronization, Play upgrades, physical-device latency or release performance.
- Even a completed green diagnostic pair sets both `nativeAcceptance` and
  `releaseAcceptance` to false. All original exact-source release gates still apply.

If current QA464 source3606 independently passes all 16 required CI roles with no
ANR, its separate owner TestFlight path can proceed under the existing gates. This
experiment remains infrastructure stability follow-up and is not a proven fix.
Vercel deployment is explicitly disabled for the experiment branch.
