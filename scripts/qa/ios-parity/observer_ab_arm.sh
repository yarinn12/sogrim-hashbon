#!/usr/bin/env bash
# One clean simulator per arm; retain both original default and AX categories.
set -euo pipefail

arm="$1"
case "$arm" in on|off) ;; *) exit 64 ;; esac
out="$AB_ROOT/$arm"
[[ ! -e "$out" ]]
mkdir "$out"
export AB_OBSERVER="$arm"
export AB_UDID=""

finish_arm() {
  local status=$?
  trap - EXIT
  set +e
  python3 "$AB_CONTROL/observer_ab.py" snapshot "$AB_PRODUCTS" "$out/after.json" \
    > "$out/hash-after.log" 2>&1
  local hash_status=$?
  if (( status == 0 && hash_status != 0 )); then status=$hash_status; fi
  if [[ -n "$AB_UDID" ]]; then
    xcrun simctl shutdown "$AB_UDID" > "$out/shutdown.log" 2>&1
    local shutdown_state=""
    for attempt in {1..30}; do
      shutdown_state="$(xcrun simctl list devices -j | python3 -c '
import json,sys
udid=sys.argv[1]
rows=json.load(sys.stdin)["devices"]
print(next((item["state"] for items in rows.values() for item in items if item["udid"]==udid),"Missing"))
' "$AB_UDID")"
      [[ "$shutdown_state" == Shutdown ]] && break
      sleep 1
    done
    printf '{"udid":"%s","state":"%s"}\n' "$AB_UDID" "$shutdown_state" > "$out/shutdown.json"
    if [[ "$shutdown_state" != Shutdown ]]; then status=1; fi
  else
    status=1
  fi
  printf '%s\n' "$status" > "$out/exit-code.txt"
  date -u +%FT%TZ > "$out/finished-at-utc.txt"
  exit "$status"
}
trap finish_arm EXIT

cp "$AB_ROOT/baseline.json" "$out/baseline.json"
python3 "$AB_CONTROL/observer_ab.py" snapshot "$AB_PRODUCTS" "$out/before.json"
cmp "$AB_ROOT/baseline.json" "$out/before.json"
cp "$AB_MANIFEST" "$out/package-manifest.json"
date -u +%FT%TZ > "$out/started-at-utc.txt"
AB_UDID="$(xcrun simctl create "iOS home observer $arm" "$AB_DEVICE_TYPE_ID" "$AB_RUNTIME_ID")"
export AB_UDID
printf '{"udid":"%s","runtimeId":"%s","deviceTypeId":"%s"}\n' \
  "$AB_UDID" "$AB_RUNTIME_ID" "$AB_DEVICE_TYPE_ID" > "$out/simulator.json"
date -u +%FT%TZ > "$out/boot-started-at-utc.txt"
xcrun simctl boot "$AB_UDID" > "$out/boot.log" 2>&1
xcrun simctl bootstatus "$AB_UDID" -b > "$out/bootstatus.log" 2>&1
date -u +%FT%TZ > "$out/boot-finished-at-utc.txt"
xcrun simctl install "$AB_UDID" "$AB_APP_BUNDLE" > "$out/install.log" 2>&1
date -u +%FT%TZ > "$out/install-finished-at-utc.txt"

set +e
bash "$AB_CONTROL/observer_ab_category.sh" "$out" default
default_status=$?
set -e
xcrun simctl terminate "$AB_UDID" com.sogrimhashbon.app > "$out/terminate.log" 2>&1 || true
set +e
xcrun simctl uninstall "$AB_UDID" com.sogrimhashbon.app > "$out/uninstall.log" 2>&1
uninstall_status=$?
xcrun simctl ui "$AB_UDID" content_size accessibility-extra-large > "$out/content-size.log" 2>&1
content_size_status=$?
set -e
if (( content_size_status == 0 )); then
  set +e
  bash "$AB_CONTROL/observer_ab_category.sh" "$out" accessibility-extra-large
  ax_status=$?
  set -e
else
  ax_status=$content_size_status
fi

if (( default_status == 0 && uninstall_status == 0 && ax_status == 0 )); then
  set +e
  python3 "$AB_FIXTURES/prepare.py" validate "$out" "$AB_SOURCE_SHA" \
    > "$out/validation.log" 2>&1
  validation_status=$?
  set -e
  printf '%s\n' "$validation_status" > "$out/validation.exit-code.txt"
else
  printf 'skipped after category or isolation failure\n' > "$out/validation.log"
  printf '125\n' > "$out/validation.exit-code.txt"
fi

if (( default_status != 0 )); then exit "$default_status"; fi
if (( uninstall_status != 0 )); then exit "$uninstall_status"; fi
if (( ax_status != 0 )); then exit "$ax_status"; fi
exit "$validation_status"
