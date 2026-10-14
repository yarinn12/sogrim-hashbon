#!/usr/bin/env bash
# Run one original parity category. The caller invokes this as a child process,
# so its errexit behavior cannot be disabled by the caller recording a failure.
set -euo pipefail

arm_dir="$1"
category="$2"
case "$category" in default|accessibility-extra-large) ;; *) exit 64 ;; esac
out="$arm_dir/$category"
mkdir "$out"
observer_pid=""
observer_dir=""

finish_category() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$observer_pid" ]]; then
    : > "$observer_dir/stop"
    for attempt in {1..30}; do
      jobs -pr | grep -Fxq "$observer_pid" || break
      sleep 1
    done
    if jobs -pr | grep -Fxq "$observer_pid"; then
      printf 'observer did not stop within 30 seconds\n' >> "$observer_dir/observer.log"
      kill "$observer_pid" 2>/dev/null
    fi
    wait "$observer_pid"
    local monitor_status=$?
    printf '%s\n' "$monitor_status" > "$observer_dir/exit-code.txt"
    if (( status == 0 && monitor_status != 0 )); then status=$monitor_status; fi
  fi
  local container=""
  container="$(xcrun simctl get_app_container "$AB_UDID" com.sogrimhashbon.app data 2> "$out/container-error.log")"
  if [[ -n "$container" && -d "$container/Documents" ]]; then
    shopt -s nullglob
    local files=("$container/Documents"/native-parity*.json
                 "$container/Documents"/native-parity*.png
                 "$container/Documents"/native-parity*.log)
    if (( ${#files[@]} )); then cp "${files[@]}" "$out/"; fi
    shopt -u nullglob
  fi
  if [[ -d "$out/result.xcresult" ]]; then
    xcrun xcresulttool export attachments --path "$out/result.xcresult" \
      --output-path "$out/system-screenshots" > "$out/export-attachments.log" 2>&1
    local export_status=$?
    if (( status == 0 && export_status != 0 )); then status=$export_status; fi
  fi
  xcrun simctl io "$AB_UDID" screenshot "$out/final-simulator.png" > "$out/screenshot.log" 2>&1
  local screenshot_status=$?
  if (( status == 0 && screenshot_status != 0 )); then status=$screenshot_status; fi
  xcrun simctl spawn "$AB_UDID" log show --last 8m --style compact \
    --predicate 'process == "App" OR process CONTAINS[c] "WebContent" OR process CONTAINS[c] "GPU"' \
    > "$out/simulator.log" 2>&1
  printf '%s\n' "$status" > "$out/exit-code.txt"
  date -u +%FT%TZ > "$out/finished-at-utc.txt"
  exit "$status"
}
trap finish_category EXIT

date -u +%FT%TZ > "$out/started-at-utc.txt"
printf '%s\n' "$AB_OBSERVER" > "$out/observer-state.txt"
if [[ "$AB_OBSERVER" == on ]]; then
  observer_dir="$out/observer"
  mkdir "$observer_dir"
  python3 "$AB_FIXTURES/native_stall_monitor.py" \
    --udid "$AB_UDID" --bundle-id com.sogrimhashbon.app \
    --manifest "$AB_MANIFEST" --source-sha "$AB_SOURCE_SHA" \
    --source-tree "$AB_SOURCE_TREE" --output-dir "$observer_dir" \
    --stop-file "$observer_dir/stop" > "$observer_dir/observer.log" 2>&1 &
  observer_pid=$!
fi
printf 'test-without-building\n' > "$out/test-started.txt"
date -u +%FT%TZ > "$out/test-started-at-utc.txt"
xcodebuild -xctestrun "$AB_XCTESTRUN" \
  -destination "platform=iOS Simulator,id=$AB_UDID" \
  -parallel-testing-enabled NO \
  -resultBundlePath "$out/result.xcresult" \
  test-without-building CODE_SIGNING_ALLOWED=NO > "$out/test.log" 2>&1
