#!/usr/bin/env bash
# Parent records failures while each arm runs as an independent errexit shell.
set -euo pipefail

case "$AB_ORDER" in
  on-off) arms=(on off) ;;
  off-on) arms=(off on) ;;
  *) exit 64 ;;
esac
: > "$AB_ROOT/executed-order.txt"
for arm in "${arms[@]}"; do
  printf '%s\n' "$arm" >> "$AB_ROOT/executed-order.txt"
  set +e
  bash "$AB_CONTROL/observer_ab_arm.sh" "$arm"
  arm_status=$?
  set -e
  printf '%s\n' "$arm_status" > "$AB_ROOT/$arm/parent-exit-code.txt"
  if [[ -f "$AB_ROOT/$arm/host-diagnostics-unconfirmed.txt" ]]; then break; fi
  # A failed parity test still gets the opposite arm. A simulator that did not
  # shut down is an infrastructure failure and cannot precede another arm.
  if [[ ! -f "$AB_ROOT/$arm/shutdown.json" ]] || \
     ! python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["state"]=="Shutdown"' \
       "$AB_ROOT/$arm/shutdown.json"; then
    break
  fi
done
python3 "$AB_CONTROL/observer_ab.py" verify "$AB_ROOT"
