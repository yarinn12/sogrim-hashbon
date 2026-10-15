# Inactive libpulse runtime preparation fix

Original one-shot38821742564/attempt1 failed before ADB or any arm: the actual
`.../emulator/emulator -version` command returned127 with empty stdout and
`qemu-system-x86_64: error while loading shared libraries: libpulse.so.0`.
Original artifacts contain no ldd invocation or inherited loader environment;
neither can be reconstructed as a measured fact. All four factors stay untested.

Ubuntu24.04's [libpulse0](https://packages.ubuntu.com/noble/libpulse0) supplies
PulseAudio client runtime libraries; the sound-server package is only suggested.
The [Android launcher source](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/emulator/main-emulator.cpp)
selects the regular/headless backend and sets bundled-library search paths.
The [upstream binary-layout documentation](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/docs/PREBUILT-BINARIES.TXT)
documents those library locations. These primary sources explain the dependency
and inspection environment; they are not an assertion that upstream HEAD is the
exact binary build retained by the original run.

The new host-only step records OS/ldd/inherited loader facts and the before-install
qemu dependency output, then installs only libpulse0 from the runner's existing
Ubuntu apt repositories. Package/version/architecture and actual package files
are checked. The PulseAudio library closure and both regular/headless qemu
closures must resolve before proceeding. SDK bundled paths apply only to ldd;
the existing version command and its strict exit/protocol checks are unchanged.
Any install or final unresolved dependency failure stops before input proofs.
Before-install ldd's exit is a retained observation, not a waived readiness gate.

The app source c14, APK A/B content contract, resources, renderer, KVM, deadlines,
Native/release predicates and retry policy remain unchanged. Source340 is not
modified. The fix branch is inactive; no push or new CI run is authorized here.
Offline tests use explicitly synthetic apt/dpkg/ldd/SDK dependencies and execute
the actual workflow caller in its actual order. Real Ubuntu installation and the
SDK version guard remain pending a later separately reviewed one-shot decision.
