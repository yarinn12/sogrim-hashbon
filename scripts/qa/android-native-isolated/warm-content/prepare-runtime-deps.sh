#!/usr/bin/env bash
# Host library preparation only; the existing SDK version/input guards stay strict.
set -euo pipefail
test "$ANDROID_WARM_CONTENT_RUN" = reviewed-diagnostic-only
test "$(uname -s)" = Linux
test "$(dpkg --print-architecture)" = amd64
out="$PWD/artifacts/android-native-isolated/sdk-runtime-dependencies"
test ! -e "$out"
mkdir -p "$out"
qemu="$ANDROID_HOME/emulator/qemu/linux-x86_64/qemu-system-x86_64"
headless="$qemu-headless"
test -x "$qemu"; test -x "$headless"
cat /etc/os-release > "$out/os-release.txt"
printf 'inherited LD_LIBRARY_PATH=%s\n' "${LD_LIBRARY_PATH:-}" > "$out/loader-environment.txt"
ldd --version > "$out/ldd-version.txt" 2>&1
# This is a recorded before-install observation, not a readiness decision.
before_status=0
ldd "$qemu" > "$out/qemu-before.ldd.txt" 2>&1 || before_status=$?
printf '%s\n' "$before_status" > "$out/qemu-before.ldd.exit"
sudo apt-get update > "$out/apt-update.log" 2>&1
sudo apt-get install --no-install-recommends -y libpulse0 > "$out/apt-install.log" 2>&1
dpkg-query -W '-f=${Status}\t${Version}\t${Architecture}\n' libpulse0 > "$out/package-status.txt"
awk -F '\t' '$1=="install ok installed"&&$2!=""&&$3=="amd64"{ok=1}END{exit !ok}' "$out/package-status.txt"
dpkg-query -L libpulse0 > "$out/package-files.txt"
mapfile -t pulse_files < <(awk '/^\/.*\/libpulse\.so\.0$/{print}' "$out/package-files.txt")
test "${#pulse_files[@]}" = 1
pulse="${pulse_files[0]}"
test -f "$pulse"; test -r "$pulse"
ldd "$pulse" > "$out/libpulse-after.ldd.txt" 2>&1
if grep -q 'not found' "$out/libpulse-after.ldd.txt"; then exit 1; fi
# Model the SDK launcher's documented bundled-library paths for inspection only.
# Do not export this environment to the original SDK version or AVD commands.
proof_libraries="$ANDROID_HOME/emulator/lib64/qt/lib:$ANDROID_HOME/emulator/lib64/qt:$ANDROID_HOME/emulator/lib64/libstdc++:$ANDROID_HOME/emulator/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
printf 'ldd-only LD_LIBRARY_PATH=%s\n' "$proof_libraries" >> "$out/loader-environment.txt"
LD_LIBRARY_PATH="$proof_libraries" ldd "$qemu" > "$out/qemu-after.ldd.txt" 2>&1
LD_LIBRARY_PATH="$proof_libraries" ldd "$headless" > "$out/headless-after.ldd.txt" 2>&1
for file in qemu-after.ldd.txt headless-after.ldd.txt; do
  if grep -q 'not found' "$out/$file"; then exit 1; fi
done
grep -Eq 'libpulse\.so\.0 => /' "$out/qemu-after.ldd.txt"
printf 'libpulse0 and recorded runtime library closures verified; existing SDK version/input guards still required\n' > "$out/runtime-dependencies-ready.txt"
