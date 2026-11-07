"""Read-only, eight-second calibration for one job-created simulator.

A failed/missing receipt never authorizes the host route. The observer must retain
its original live simctl ownership verification in that case. No PID is sampled.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import plistlib
import re
import selectors
import subprocess
import time
from pathlib import Path

BUDGET_SECONDS = 8.0
MAX_INPUT = 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024
MAX_TOOL = 32 * 1024 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")
UDID = re.compile(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\Z")

class CalibrationError(Exception):
    pass

def check_time(deadline, clock):
    if clock() >= deadline:
        raise CalibrationError("preflight-deadline-exceeded")

def safe_path(path, parent):
    path, parent = Path(path).absolute(), Path(parent).absolute()
    try:
        parts = path.relative_to(parent).parts
    except ValueError as error:
        raise CalibrationError("foreign-evidence-path") from error
    if parent.is_symlink() or any(parent.joinpath(*parts[:i]).is_symlink() for i in range(1, len(parts) + 1)):
        raise CalibrationError("symlink-evidence")
    return path

def bounded_read(path, parent, limit=MAX_INPUT, deadline=None, clock=time.monotonic):
    path = safe_path(path, parent)
    if not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_size > limit:
        raise CalibrationError("unowned-missing-or-oversized-evidence")
    if deadline is not None: check_time(deadline, clock)
    before = path.stat()
    with path.open("rb") as stream: raw = stream.read(limit + 1)
    after = path.stat()
    if len(raw) > limit or (before.st_ino, before.st_dev, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_dev, after.st_size, after.st_mtime_ns):
        raise CalibrationError("evidence-changed-or-oversized")
    if deadline is not None: check_time(deadline, clock)
    return raw, after

def host_identity():
    if platform.system() != "Darwin": raise CalibrationError("unsupported-host")
    u = os.uname()
    raw = json.dumps([u.nodename, u.release, u.version, u.machine, os.getuid()], separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()

def context(manifest_path, sha, tree, udid, deadline=None, clock=time.monotonic):
    if not SHA.fullmatch(sha) or not SHA.fullmatch(tree) or not UDID.fullmatch(udid):
        raise CalibrationError("invalid-source-or-udid")
    env = {k: os.environ.get(k, "") for k in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB")}
    if (not env["GITHUB_RUN_ID"].isdigit() or not env["GITHUB_RUN_ATTEMPT"].isdigit()
            or not re.fullmatch(r"[A-Za-z0-9_-]+", env["GITHUB_JOB"])):
        raise CalibrationError("missing-job-identity")
    raw, _ = bounded_read(manifest_path, Path(manifest_path).parent, deadline=deadline, clock=clock)
    manifest = json.loads(raw)
    if not isinstance(manifest, dict): raise CalibrationError("invalid-manifest-json")
    if manifest.get("sourceSha") != sha or manifest.get("sourceTree") != tree:
        raise CalibrationError("manifest-source-mismatch")
    if not SHA.fullmatch(str(manifest.get("fixtureSha", ""))) or not SHA.fullmatch(str(manifest.get("fixtureTree", ""))):
        raise CalibrationError("missing-fixture-identity")
    tool_raw, _ = bounded_read(Path(__file__), Path(__file__).parent, deadline=deadline, clock=clock)
    module_sha = hashlib.sha256(tool_raw).hexdigest()
    if manifest.get("qaFixtures", {}).get(Path(__file__).name) != module_sha:
        raise CalibrationError("preflight-tool-source-mismatch")
    return dict(sourceSha=sha, sourceTree=tree, udid=udid.upper(), runId=env["GITHUB_RUN_ID"],
                runAttempt=env["GITHUB_RUN_ATTEMPT"], job=env["GITHUB_JOB"],
                hostIdentity=host_identity(), uid=os.getuid(), preflightToolSha256=module_sha,
                fixtureSha=manifest["fixtureSha"], fixtureTree=manifest["fixtureTree"])

def make_ownership(manifest_path, udid, runtime, device_type):
    raw, _ = bounded_read(manifest_path, Path(manifest_path).parent)
    manifest = json.loads(raw)
    if not isinstance(manifest, dict): raise CalibrationError("invalid-manifest-json")
    ctx = context(manifest_path, manifest["sourceSha"], manifest["sourceTree"], udid)
    if not runtime.startswith("com.apple.CoreSimulator.SimRuntime.iOS-") or not device_type.startswith("com.apple.CoreSimulator.SimDeviceType.iPhone-"):
        raise CalibrationError("unexpected-runtime-or-device-type")
    return dict(schemaVersion=1, method="simctl-create-in-this-job", context=ctx,
                createdWall=time.time(), runtime=runtime, deviceType=device_type)

def read_ownership(path, manifest_path, ctx, deadline, clock):
    raw, _ = bounded_read(path, Path(manifest_path).parent, deadline=deadline, clock=clock)
    owner = json.loads(raw)
    if not isinstance(owner, dict): raise CalibrationError("invalid-ownership-json")
    created = owner.get("createdWall")
    if (type(owner.get("schemaVersion")) is not int or owner["schemaVersion"] != 1 or owner.get("method") != "simctl-create-in-this-job"
            or owner.get("context") != ctx or type(created) not in (float, int)
            or not math.isfinite(created) or created > time.time() + 2):
        raise CalibrationError("foreign-or-invalid-ownership")
    if (not str(owner.get("runtime", "")).startswith("com.apple.CoreSimulator.SimRuntime.iOS-")
            or not str(owner.get("deviceType", "")).startswith("com.apple.CoreSimulator.SimDeviceType.iPhone-")):
        raise CalibrationError("missing-owned-runtime")
    return owner, hashlib.sha256(raw).hexdigest()

def tool_identity(path, deadline, clock):
    path = Path(path)
    if not path.is_absolute() or path.parts[-5:] != ("Contents", "Developer", "usr", "bin", "simctl"):
        raise CalibrationError("foreign-simctl-tool")
    safe_path(path, path.anchor)
    stat = path.stat()
    if not path.is_file() or stat.st_uid not in {0, os.getuid()} or stat.st_size > MAX_TOOL:
        raise CalibrationError("invalid-simctl-tool")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            check_time(deadline, clock)
            part = stream.read(65536)
            if not part: break
            digest.update(part)
    after = path.stat()
    if (stat.st_ino, stat.st_dev, stat.st_size, stat.st_mtime_ns) != (after.st_ino, after.st_dev, after.st_size, after.st_mtime_ns):
        raise CalibrationError("simctl-tool-changed")
    check_time(deadline, clock)
    return dict(path=str(path), sha256=digest.hexdigest(), inode=stat.st_ino, device=stat.st_dev,
                bytes=stat.st_size, mtimeNs=stat.st_mtime_ns)

def bounded_command(args, deadline, clock):
    """Read bounded stdout/stderr; only this function's child may be terminated."""
    check_time(deadline, clock)
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector()
    chunks = {"out": [], "err": []}
    size = 0
    try:
        selector.register(process.stdout, selectors.EVENT_READ, "out")
        selector.register(process.stderr, selectors.EVENT_READ, "err")
        while selector.get_map():
            check_time(deadline, clock)
            for key, _ in selector.select(max(0, deadline - clock())):
                data = os.read(key.fd, min(65536, MAX_OUTPUT - size + 1))
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                size += len(data)
                if size > MAX_OUTPUT: raise CalibrationError("command-output-over-limit")
                chunks[key.data].append(data)
        status = process.wait(timeout=max(0, deadline - clock()))
        check_time(deadline, clock)
        if status != 0: raise CalibrationError("readonly-command-failed")
        return b"".join(chunks["out"])
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()  # Only our own readonly helper; never an app/PID argument.
            try: process.wait(timeout=max(0, deadline - clock()))
            except subprocess.TimeoutExpired: pass
        process.stdout.close()
        process.stderr.close()

def device_observation(raw, owner, ctx):
    if len(raw) > MAX_OUTPUT: raise CalibrationError("command-output-over-limit")
    payload = json.loads(raw)
    if not isinstance(payload, dict): raise CalibrationError("invalid-simctl-json")
    devices = payload.get("devices")
    if not isinstance(devices, dict): raise CalibrationError("invalid-simctl-json")
    if any(not isinstance(entries, list) or any(not isinstance(row, dict) for row in entries) for entries in devices.values()):
        raise CalibrationError("invalid-simctl-json")
    rows = [(runtime, row) for runtime, entries in devices.items() for row in entries]
    if len(rows) != 1: raise CalibrationError("foreign-or-ambiguous-simctl-result")
    runtime, row = rows[0]
    if (str(row.get("udid", "")).upper() != ctx["udid"] or runtime != owner["runtime"]
            or row.get("deviceTypeIdentifier") != owner["deviceType"] or row.get("isAvailable") is not True
            or row.get("state") != "Booted"):
        raise CalibrationError("owned-device-not-booted-or-mismatched")
    return dict(rawSha256=hashlib.sha256(raw).hexdigest(), udid=ctx["udid"], runtime=runtime,
                deviceType=row["deviceTypeIdentifier"], state=row["state"], isAvailable=True)

def local_observation(ctx, deadline, clock):
    root = Path.home() / "Library/Developer/CoreSimulator/Devices" / ctx["udid"]
    path = root / "device.plist"
    raw, stat = bounded_read(path, root, deadline=deadline, clock=clock)
    local = plistlib.loads(raw)
    if (not isinstance(local, dict) or str(local.get("UDID", "")).upper() != ctx["udid"]
            or type(local.get("state")) is not int or local["state"] != 3):
        raise CalibrationError("unsupported-local-format-or-state")
    return dict(pathDigest=hashlib.sha256(str(path).encode()).hexdigest(), udid=ctx["udid"],
                observedState=local["state"], sha256=hashlib.sha256(raw).hexdigest(),
                inode=stat.st_ino, device=stat.st_dev, mtimeNs=stat.st_mtime_ns, uid=stat.st_uid)

def run_preflight(manifest_path, ownership_path, sha, tree, udid, command=None, clock=None):
    clock = clock or time.monotonic
    command = command or bounded_command
    start = clock(); deadline = start + BUDGET_SECONDS
    report = dict(schemaVersion=1, verified=False, newHostRouteVerified=False,
                  legacyVerificationRequired=True, budgetSeconds=BUDGET_SECONDS)
    try:
        ctx = context(manifest_path, sha, tree, udid, deadline, clock)
        owner, owner_sha = read_ownership(ownership_path, manifest_path, ctx, deadline, clock)
        tool_path = command(["/usr/bin/xcrun", "--find", "simctl"], deadline, clock).decode("utf8").strip()
        tool = tool_identity(tool_path, deadline, clock)
        query = [tool["path"], "list", "devices", "-j", ctx["udid"]]
        first = device_observation(command(query, deadline, clock), owner, ctx)
        local = local_observation(ctx, deadline, clock)
        second = device_observation(command(query, deadline, clock), owner, ctx)
        if local != local_observation(ctx, deadline, clock): raise CalibrationError("local-snapshot-changed")
        if tool != tool_identity(tool_path, deadline, clock): raise CalibrationError("simctl-tool-changed")
        check_time(deadline, clock)
        report.update(verified=True, newHostRouteVerified=True, legacyVerificationRequired=False,
                      context=ctx, ownershipSha256=owner_sha, tool=tool, localDevice=local,
                      cliObservations=[first, second], calibratedWall=time.time(), reason="same-job-host-observed-booted")
    except (CalibrationError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        report["reason"] = str(error) if isinstance(error, CalibrationError) else type(error).__name__
    report["elapsedSeconds"] = clock() - start
    if report["elapsedSeconds"] >= BUDGET_SECONDS:
        report.update(verified=False, newHostRouteVerified=False, legacyVerificationRequired=True,
                      reason="preflight-deadline-exceeded")
    return report

def load_calibration(calibration_path, ownership_path, manifest_path, sha, tree, udid):
    """Recheck same job/host/tool identity. No simctl or PID command is executed."""
    clock = time.monotonic; deadline = clock() + BUDGET_SECONDS
    ctx = context(manifest_path, sha, tree, udid, deadline, clock)
    owner, owner_sha = read_ownership(ownership_path, manifest_path, ctx, deadline, clock)
    raw, _ = bounded_read(calibration_path, Path(manifest_path).parent, deadline=deadline, clock=clock)
    receipt = json.loads(raw)
    if not isinstance(receipt, dict): raise CalibrationError("invalid-calibration-json")
    if (type(receipt.get("schemaVersion")) is not int or receipt["schemaVersion"] != 1 or receipt.get("verified") is not True
            or receipt.get("newHostRouteVerified") is not True or receipt.get("legacyVerificationRequired") is not False
            or receipt.get("context") != ctx or receipt.get("ownershipSha256") != owner_sha
            or type(receipt.get("elapsedSeconds")) not in (int, float)
            or not 0 <= receipt["elapsedSeconds"] < BUDGET_SECONDS
            or type(receipt.get("calibratedWall")) not in (int, float)
            or not owner["createdWall"] <= receipt["calibratedWall"] <= time.time() + 2
            or not isinstance(receipt.get("cliObservations"), list) or len(receipt["cliObservations"]) != 2
            or any(not isinstance(v, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(v.get("rawSha256", "")))
                   or v.get("udid") != ctx["udid"] or v.get("runtime") != owner["runtime"]
                   or v.get("deviceType") != owner["deviceType"] or v.get("state") != "Booted"
                   or v.get("isAvailable") is not True for v in receipt["cliObservations"])):
        raise CalibrationError("calibration-not-verified-for-this-job-host-source")
    tool = receipt.get("tool", {})
    if not isinstance(tool, dict): raise CalibrationError("invalid-calibration-tool-format")
    if tool != tool_identity(tool.get("path", ""), deadline, clock): raise CalibrationError("calibration-tool-mismatch")
    observed = receipt.get("localDevice", {})
    if not isinstance(observed, dict): raise CalibrationError("invalid-calibration-local-format")
    current = local_observation(ctx, deadline, clock)
    # Other local plist fields may change; calibration does not assume byte immutability.
    for name in ("pathDigest", "udid", "observedState", "inode", "device", "uid"):
        if current.get(name) != observed.get(name): raise CalibrationError("calibration-local-device-mismatch")
    check_time(deadline, clock)
    return receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("manifest", "ownership", "source-sha", "source-tree", "udid"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    report = run_preflight(args.manifest, args.ownership, args.source_sha, args.source_tree, args.udid)
    print(json.dumps(report, sort_keys=True))
    raise SystemExit(0 if report["verified"] else 1)

if __name__ == "__main__": main()
