# Local preparation: original ASG workload with SwANGLE

This is a single compatibility diagnostic. The first creation push of the exact
reviewed branch would start one Ubuntu 24.04 job, run number 1 and attempt 1, with
the original 45 minute bound. There is no dispatch, retry, alternative arm or
release path. Root must review the frozen source and local receipts before any
push. Vercel deployment is disabled for this branch.

The only graphics option change is `-gpu swiftshader` to `-gpu swangle`. ASG,
2 cores, 4096 MB, the original 2d4 Debug APK and its single public Debug signer,
the recorded SDK configuration and the 127-file SDK binary reference stay pinned.
The full original matrix, hold/coldstarts, pages, journey, IME/persistence checks,
negative font controls, geometry, both health checks, continuous history and full
ANR gate keep their original bodies and deadlines. The unchanged 4fcc guest/host
observer remains required. There is no BPF collection or profiler repair here.

Android's [official emulator documentation](https://developer.android.com/studio/run/emulator-acceleration)
describes SwANGLE as SwiftShader with the ANGLE backend. The official
[launcher source](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-main-dev/android/emulator/main-emulator.cpp)
selects the ANGLE library directory for this option. The official
[emugl configuration source](https://android.googlesource.com/platform/external/qemu/+/refs/heads/emu-main-dev/android/android-ui/modules/aemu-gl-init/src/android/opengl/emugl_config.cpp)
maps SwANGLE GLES to ANGLE Indirect and its Vulkan provider to SwiftShader.
These moving source references explain the expected route; they do not prove
the exact source used to build the installed SDK binary. Runtime evidence is
mandatory, and no environment override is added to force a result.

The new renderer guard requires unique actual startup evidence for gfxstream,
SwANGLE GLES, SwiftShader Vulkan selection, inactive guest Vulkan, GL composition,
software GLES 3.x and the original DMA capabilities. Before and after the original
workload, the owned PID/birth must also have executable mappings of the pinned
ANGLE EGL/GLES libraries and at least one pinned SwiftShader Vulkan library.
Those mappings must match the original SDK hashes, sizes and their actual inode.
Missing, ambiguous, changed, legacy, host, lavapipe or fallback evidence fails.
The old renderer guard and its real A/B log fixtures remain unchanged; both old
fixtures are negative cases for this third route. Library snapshots do not prove
lifetime coverage or exclusive execution by a provider.

Operational child environments, fresh private homes, exact ADB serial, PID/birth
ownership checks, the original 15 second cleanup bound, SDK checks and immutable
APK/source checks remain. Only owned process metadata and SDK files are read.
The raw logs, maps, trace, all stage exits, full ANR history, command audit and
partial failure artifacts are retained. Instrumentation and additional mapping
checks add overhead; this is not a calibrated causal renderer comparison.

`originalSourceGate` remains `FAILED`, and `nativeAcceptance` and
`releaseAcceptance` remain `false`, even if this single diagnostic completes
without an ANR. It does not exonerate the application, establish an ANR cause,
validate a physical phone or authorize a store release.

Local controls run with `node --test tests/androidSwangleCompatibility.test.mjs`.
The immutable-artifact Python controls run inside one Node wrapper and are not
additional Node tests. All controls are part of the normal `npm test` inventory.
Source preparation and synthetic tests do not establish real SwANGLE runtime
compatibility; only the separately reviewed, single actual run can test that.
