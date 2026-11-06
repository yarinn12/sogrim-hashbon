"""Read-only stall observer for one owned iOS simulator parity category.

This process is diagnostic only. It never drives the app or changes XCTest's
deadline, result, or retry policy. It samples only a verified simulator PID.
"""

import argparse
from datetime import datetime
import hashlib
import json
import math
import os
import platform
import plistlib
import re
import subprocess
import time
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path
from native_host_preflight import CalibrationError, host_identity, load_calibration


MAX_BYTES = 64 * 1024 * 1024
MAX_SECONDS = 600
GAP_SECONDS = 5
STARTUP_SECONDS = 20
SESSION_FILE = re.compile(r"native-parity-status-([0-9A-Fa-f-]{36})\.log\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
UDID = re.compile(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\Z")


class MonitorUnavailable(Exception):
    """Evidence is insufficient to identify an owned sample target."""

    def __init__(self, reason, details=None):
        super().__init__(reason)
        self.details = details or {}


@dataclass(frozen=True)
class Assessment:
    eligible: bool
    reason: str
    session: str = ""
    phase: str = ""
    gap_seconds: float = 0.0
    journal_path: Path | None = None
    first_time: float = 0.0
    elapsed_seconds: float = 0.0


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    uid: int
    started: str
    command: str
    start_epoch: float = 0.0


def platform_supported(name):
    return name == "Darwin"


def _safe_child(path, parent):
    path, parent = Path(path).absolute(), Path(parent).absolute()
    try:
        parts = path.relative_to(parent).parts
    except ValueError as error:
        raise MonitorUnavailable("path-outside-owned-device") from error
    if parent.is_symlink() or any(parent.joinpath(*parts[:i]).is_symlink() for i in range(1, len(parts) + 1)):
        raise MonitorUnavailable("symlink-path")
    return path


def assess_journal(documents, source_sha, source_tree, run_started, now):
    """Identify a current session's stalled startup or pre-keyboard gap."""
    documents = Path(documents)
    if documents.is_symlink():
        return Assessment(False, "symlink-journal")
    try:
        files = [p for p in documents.iterdir() if SESSION_FILE.fullmatch(p.name)]
    except (FileNotFoundError, NotADirectoryError):
        return Assessment(False, "no-journal")
    if not files:
        return Assessment(False, "no-journal")
    files.sort(key=lambda p: (p.lstat().st_mtime_ns, p.name), reverse=True)
    path = files[0]
    if len(files) > 1 and files[1].lstat().st_mtime_ns == path.lstat().st_mtime_ns:
        return Assessment(False, "ambiguous-newest-session")
    if path.is_symlink() or not path.is_file():
        return Assessment(False, "symlink-journal", journal_path=path)
    stat = path.stat()
    if stat.st_size > MAX_BYTES:
        return Assessment(False, "journal-over-limit", journal_path=path)
    if stat.st_mtime < run_started:
        return Assessment(False, "stale-journal", journal_path=path)
    session = SESSION_FILE.fullmatch(path.name).group(1).upper()
    try:
        raw = path.read_bytes()
        lines = raw.splitlines() if raw.endswith(b"\n") else raw.splitlines()[:-1]
        rows = [json.loads(line) for line in lines]
    except (OSError, ValueError, UnicodeError):
        return Assessment(False, "invalid-journal", session=session, journal_path=path)
    if not rows:
        return Assessment(False, "empty-journal", session=session, journal_path=path)
    if any(not isinstance(row, dict) for row in rows):
        return Assessment(False, "invalid-journal", session=session, journal_path=path)
    if any(row.get("sourceSha") != source_sha or row.get("sourceTree") != source_tree for row in rows):
        return Assessment(False, "source-mismatch", session=session, journal_path=path)
    if any(str(row.get("session", "")).upper() != session for row in rows):
        return Assessment(False, "session-mismatch", session=session, journal_path=path)
    times = [row.get("time") for row in rows]
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in times):
        return Assessment(False, "invalid-time", session=session, journal_path=path)
    if times[0] < run_started or times[-1] > now + 2 or any(b < a for a, b in zip(times, times[1:])):
        return Assessment(False, "stale-or-invalid-time", session=session, journal_path=path)
    profile_seen = any(row.get("event") == "captureReceived" and row.get("phase") == "profile" for row in rows)
    ended = any(row.get("phase") in {"keyboard-amount", "keyboard-name", "error", "saved", "resumed", "restored"} for row in rows)
    if ended:
        return Assessment(False, "phase-ended", session=session, journal_path=path, first_time=times[0])
    if not profile_seen:
        appeared = next((row["time"] for row in rows if row.get("event") == "viewDidAppear"), None)
        still_starting = any(row.get("event") == "decoded" and row.get("phase") in {"starting", "missing"}
                             and row.get("nativeStatusReady") is False for row in rows)
        ready = any((row.get("event") == "decoded" and row.get("nativeStatusReady") is True)
                    or (row.get("event") == "captureReceived" and row.get("phase") in {"home", "restored"})
                    for row in rows)
        if appeared is not None and still_starting and not ready:
            elapsed = now - appeared
            return Assessment(elapsed > STARTUP_SECONDS,
                              "startup-not-ready" if elapsed > STARTUP_SECONDS else "startup-under-threshold",
                              session=session, phase="startup-not-ready", journal_path=path,
                              first_time=times[0], elapsed_seconds=elapsed)
        return Assessment(False, "before-profile", session=session, journal_path=path, first_time=times[0])
    gap = now - times[-1]
    if gap <= GAP_SECONDS:
        return Assessment(False, "no-gap", session=session, phase="profile-to-keyboard", gap_seconds=gap, journal_path=path, first_time=times[0])
    return Assessment(True, "gap", session=session, phase="profile-to-keyboard", gap_seconds=gap, journal_path=path, first_time=times[0])


def verify_target(*, udid, bundle_id, manifest_path, expected_sha, expected_tree,
                  device_rows, app_container, data_container, process_rows,
                  journal_path, own_uid, device_root, journal_first_time=None, prior_identity=None,
                  process_scan=None):
    """Check exact simulator, installed bundle, source, and a unique owned PID."""
    if not UDID.fullmatch(udid) or not SHA.fullmatch(expected_sha) or not SHA.fullmatch(expected_tree):
        raise MonitorUnavailable("invalid-source-or-device-identity")
    manifest_path = Path(manifest_path)
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise MonitorUnavailable("manifest-unavailable")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    except (OSError, ValueError) as error:
        raise MonitorUnavailable("manifest-unreadable") from error
    if manifest.get("sourceSha") != expected_sha or manifest.get("sourceTree") != expected_tree:
        raise MonitorUnavailable("manifest-source-mismatch")
    if len([row for row in device_rows if row.get("udid", "").upper() == udid.upper() and row.get("state") == "Booted"]) != 1:
        raise MonitorUnavailable("device-not-uniquely-booted")
    root = Path(device_root).absolute()
    app = _safe_child(app_container, root)
    data = _safe_child(data_container, root)
    if not app.is_dir() or not data.is_dir():
        raise MonitorUnavailable("container-unavailable")
    if app.relative_to(root).parts[:4] != ("data", "Containers", "Bundle", "Application"):
        raise MonitorUnavailable("foreign-app-container")
    if data.relative_to(root).parts[:4] != ("data", "Containers", "Data", "Application"):
        raise MonitorUnavailable("foreign-data-container")
    journal = _safe_child(journal_path, data / "Documents")
    if journal.parent != data / "Documents" or not journal.is_file():
        raise MonitorUnavailable("foreign-journal")
    info_path = app / "Info.plist"
    if info_path.is_symlink():
        raise MonitorUnavailable("symlink-bundle-info")
    try:
        info = plistlib.loads(info_path.read_bytes())
    except (OSError, ValueError) as error:
        raise MonitorUnavailable("bundle-info-unreadable") from error
    if info.get("CFBundleIdentifier") != bundle_id:
        raise MonitorUnavailable("installed-bundle-mismatch")
    executable_name = info.get("CFBundleExecutable")
    if not isinstance(executable_name, str) or "/" in executable_name or "\\" in executable_name:
        raise MonitorUnavailable("bundle-executable-invalid")
    executable = _safe_child(app / executable_name, root)
    if not executable.is_file():
        raise MonitorUnavailable("bundle-executable-missing")
    matching = [row for row in process_rows if row.command == str(executable) or row.command.startswith(str(executable) + " ")]
    scan = process_scan or {}
    details = {"candidateCount": len(matching),
               "parserFailures": scan.get("parserFailures", 0),
               "commandLength": scan.get("commandLength", max((len(row.command) for row in process_rows), default=0)),
               "pathDigest": hashlib.sha256(str(executable).encode("utf8")).hexdigest()}
    if len(matching) != 1:
        raise MonitorUnavailable("app-pid-not-unique", details)
    process = matching[0]
    if process.pid <= 0 or process.uid != own_uid or not process.started or process.start_epoch <= 0:
        raise MonitorUnavailable("app-pid-not-owned", details)
    if journal_first_time is not None and process.start_epoch > journal_first_time + 1:
        raise MonitorUnavailable("journal-predates-app-process", details)
    if prior_identity is not None and process != prior_identity:
        raise MonitorUnavailable("app-pid-reused-or-changed", details)
    return process


def verify_local_target(*, assessment, app_container, data_container, udid, bundle_id,
                        manifest_path, expected_sha, expected_tree, process_rows,
                        own_uid, device_root, run_started, now, prior_identity=None,
                        process_scan=None, calibration=None):
    """Revalidate a previously resolved container pair using bounded host evidence.

    No caller-supplied PID is trusted. A fresh paired native startup journal binds
    the session/source to a unique UID/start/executable from the host process scan.
    device.plist is local CoreSimulator evidence, not a stable public API: an
    unknown layout/state fails closed. Initial simctl resolution is still required.
    """
    ctx = calibration.get("context", {}) if isinstance(calibration, dict) else {}
    if (not isinstance(calibration, dict) or calibration.get("verified") is not True
            or ctx.get("sourceSha") != expected_sha or ctx.get("sourceTree") != expected_tree
            or ctx.get("udid") != udid.upper() or ctx.get("hostIdentity") != host_identity()
            or any(ctx.get(key) != os.environ.get(env) for key, env in
                   (("runId", "GITHUB_RUN_ID"), ("runAttempt", "GITHUB_RUN_ATTEMPT"), ("job", "GITHUB_JOB")))):
        raise MonitorUnavailable("host-route-not-calibrated-for-current-context")
    root = Path(device_root).absolute()
    if not UDID.fullmatch(udid) or root.name.upper() != udid.upper():
        raise MonitorUnavailable("host-device-root-mismatch")
    device_path = _safe_child(root / "device.plist", root)
    if not device_path.is_file() or device_path.stat().st_uid != own_uid:
        raise MonitorUnavailable("host-device-file-not-owned")
    try:
        if device_path.stat().st_size > MAX_BYTES:
            raise MonitorUnavailable("host-device-over-limit")
        with device_path.open("rb") as stream:
            device_bytes = stream.read(MAX_BYTES + 1)
        if len(device_bytes) > MAX_BYTES:
            raise MonitorUnavailable("host-device-over-limit")
        device = plistlib.loads(device_bytes)
    except (OSError, ValueError) as error:
        raise MonitorUnavailable("host-device-unreadable") from error
    # CoreSimulator currently persists Booted as integer 3. Do not coerce bools,
    # strings or future/unknown representations into a successful identity proof.
    if (not isinstance(device, dict) or str(device.get("UDID", "")).upper() != udid.upper()
            or type(device.get("state")) is not int or device["state"] != 3):
        raise MonitorUnavailable("host-device-not-booted-or-mismatched")
    local = calibration.get("localDevice", {})
    device_stat = device_path.stat()
    if (local.get("udid") != udid.upper() or local.get("observedState") != device["state"]
            or local.get("inode") != device_stat.st_ino or local.get("device") != device_stat.st_dev
            or local.get("uid") != own_uid):
        raise MonitorUnavailable("host-calibration-device-mismatch")
    data = _safe_child(data_container, root)
    fresh = assess_journal(data / "Documents", expected_sha, expected_tree, run_started, now)
    if (not fresh.eligible or fresh.session != assessment.session or fresh.phase != assessment.phase
            or fresh.journal_path != assessment.journal_path or fresh.first_time != assessment.first_time):
        raise MonitorUnavailable("host-phase-or-session-changed")
    if not UDID.fullmatch(fresh.session):
        raise MonitorUnavailable("host-session-invalid")
    startup = _safe_child(data / "Documents" / f"native-parity-startup-{fresh.session}.log", data / "Documents")
    if not startup.is_file() or startup.stat().st_size > MAX_BYTES or startup.stat().st_mtime < run_started:
        raise MonitorUnavailable("host-startup-unavailable-or-stale")
    try:
        with startup.open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise MonitorUnavailable("host-startup-over-limit")
        lines = raw.splitlines() if raw.endswith(b"\n") else raw.splitlines()[:-1]
        rows = [json.loads(line) for line in lines]
    except (OSError, ValueError, UnicodeError) as error:
        raise MonitorUnavailable("host-startup-invalid") from error
    if not rows or any(not isinstance(row, dict) for row in rows):
        raise MonitorUnavailable("host-startup-invalid")
    if any(row.get("sourceSha") != expected_sha or row.get("sourceTree") != expected_tree
           or str(row.get("session", "")).upper() != fresh.session for row in rows):
        raise MonitorUnavailable("host-startup-source-or-session-mismatch")
    if rows[0].get("event") != "capacitorDidLoad-enter" or rows[0].get("sequence") != 1:
        raise MonitorUnavailable("host-startup-origin-mismatch")
    times = [row.get("time") for row in rows]
    if (any(type(t) not in (int, float) or not math.isfinite(t) for t in times)
            or times[0] < run_started or times[-1] > now + 2
            or any(b < a for a, b in zip(times, times[1:])) or times[0] > fresh.first_time + 2):
        raise MonitorUnavailable("host-startup-time-mismatch")
    pids = [row.get("processId") for row in rows]
    if any(type(pid) is not int or pid <= 0 for pid in pids) or len(set(pids)) != 1:
        raise MonitorUnavailable("host-startup-pid-ambiguous")
    identity = verify_target(udid=udid, bundle_id=bundle_id, manifest_path=manifest_path,
        expected_sha=expected_sha, expected_tree=expected_tree,
        device_rows=[{"udid": device["UDID"], "state": "Booted"}],
        app_container=app_container, data_container=data, process_rows=process_rows,
        journal_path=fresh.journal_path, own_uid=own_uid, device_root=root,
        journal_first_time=min(fresh.first_time, times[0]), prior_identity=prior_identity,
        process_scan=process_scan)
    if identity.pid != pids[0]:
        raise MonitorUnavailable("host-startup-pid-mismatch")
    return identity


class DarwinProbe:
    def __init__(self, udid, bundle_id):
        self.udid, self.bundle_id = udid, bundle_id

    @staticmethod
    def command(args, timeout=8):
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        if result.returncode:
            raise MonitorUnavailable(f"command-failed:{args[0]}:{result.returncode}:{result.stderr[:300]}")
        return result.stdout.strip()

    def containers(self):
        app = self.command(["xcrun", "simctl", "get_app_container", self.udid, self.bundle_id, "app"])
        data = self.command(["xcrun", "simctl", "get_app_container", self.udid, self.bundle_id, "data"])
        return Path(app), Path(data)

    def devices(self):
        payload = json.loads(self.command(["xcrun", "simctl", "list", "devices", "-j"]))
        return [row for items in payload["devices"].values() for row in items]

    def processes(self):
        self.last_process_scan = {"parserFailures": 0, "commandLength": 0}
        output = self.command(["ps", "-axo", "pid=,uid=,lstart=,command="])
        rows = []
        pattern = re.compile(r"^\s*(\d+)\s+(\d+)\s+((?:\S+\s+){4}\S+)\s+(.+)$")
        for line in output.splitlines():
            match = pattern.match(line)
            if match:
                try:
                    start_epoch = datetime.strptime(match[3], "%a %b %d %H:%M:%S %Y").timestamp()
                except ValueError:
                    self.last_process_scan["parserFailures"] += 1
                    continue
                rows.append(ProcessIdentity(int(match[1]), int(match[2]), match[3], match[4], start_epoch))
                self.last_process_scan["commandLength"] = max(self.last_process_scan["commandLength"], len(match[4]))
            elif line.strip():
                self.last_process_scan["parserFailures"] += 1
        return rows


def _file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def capture_sample(probe, identity, output_dir, index, remaining_seconds, used_bytes):
    """Recheck the PID start time immediately before a bounded host sample."""
    import resource  # Darwin only

    same = [row for row in probe.processes() if row.pid == identity.pid]
    if len(same) != 1 or same[0] != identity:
        raise MonitorUnavailable("app-pid-reused-or-changed")
    path = output_dir / f"sample-{index}.txt"
    if path.exists():
        raise MonitorUnavailable("sample-path-exists")
    remaining_bytes = MAX_BYTES - used_bytes - 1024 * 1024
    if remaining_bytes <= 0:
        raise MonitorUnavailable("output-limit")
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    process_cpu_before = time.process_time()
    start = time.monotonic()

    def bound_file_size():
        resource.setrlimit(resource.RLIMIT_FSIZE, (remaining_bytes, remaining_bytes))

    args = ["sample", str(identity.pid), "2", "20", "-file", str(path)]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=min(8, max(1, remaining_seconds)),
                                check=False, preexec_fn=bound_file_size)
        returncode, stdout, stderr = result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired as error:
        returncode, stdout, stderr = "timeout", "", str(error)
    elapsed = time.monotonic() - start
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    size = path.stat().st_size if path.exists() else 0
    if size + used_bytes > MAX_BYTES:
        path.unlink(missing_ok=True)  # Only this observer's fresh output.
        raise MonitorUnavailable("sample-output-limit")
    return {"command": args, "exit": returncode, "wallSeconds": elapsed,
            "observerCpuSeconds": time.process_time() - process_cpu_before,
            "childCpuSeconds": (after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime),
            "bytes": size, "sha256": _file_digest(path) if size else None,
            "stdout": stdout[:2000], "stderr": stderr[:2000], "path": str(path)}


def run_observer(args, probe=None, system_name=None):
    out = Path(args.output_dir)
    report = {"sourceSha": args.source_sha, "sourceTree": args.source_tree,
              "udid": args.udid, "bundleId": args.bundle_id, "startedWall": time.time(),
              "status": "unavailable", "lastReason": "not-started", "containerState": "unresolved",
              "samples": [], "errors": [], "diagnostics": [], "identityChecks": [],
              "hostCalibration": {"verified": False, "reason": "not-checked", "legacyVerificationRequired": True}}
    start = time.monotonic()
    start_cpu = time.process_time()
    run_started = report["startedWall"]
    probe = probe or DarwinProbe(args.udid, args.bundle_id)
    def record_diagnostic(reason, container_state, assessment=None, details=None):
        row = {"reason": reason[:120], "containerState": container_state}
        if assessment is not None:
            row.update(session=assessment.session, phase=assessment.phase,
                       elapsedSeconds=assessment.elapsed_seconds)
        if details:
            row.update({key: details[key] for key in
                        ("candidateCount", "parserFailures", "commandLength", "pathDigest")
                        if key in details})
        if row not in report["diagnostics"] and len(report["diagnostics"]) < 32:
            report["diagnostics"].append(row)
    try:
        if not platform_supported(system_name or platform.system()):
            report["lastReason"] = "unsupported-os"
            return report
        cached = None
        sampled = {}
        last_sample_at = {}
        identities = {}
        attempt_index = 0
        while time.monotonic() - start < MAX_SECONDS:
            if Path(args.stop_file).exists():
                break
            if cached is None:
                try:
                    cached = probe.containers()
                    report["containerState"] = "resolved"
                except (OSError, subprocess.SubprocessError, MonitorUnavailable) as error:
                    report["lastReason"] = f"container-unavailable:{error}"
                    record_diagnostic("container-unavailable", "lookup-failed")
                    time.sleep(0.5)
                    continue
            app, data = cached
            assessment = assess_journal(data / "Documents", args.source_sha, args.source_tree, run_started, time.time())
            report["lastReason"] = assessment.reason
            if assessment.eligible:
                key = assessment.session + ":" + assessment.phase
                if sampled.get(key, 0) < 2 and time.monotonic() - last_sample_at.get(key, 0) >= 2:
                    container_state = "resolved"
                    identity_started = time.monotonic()
                    identity_finished = None
                    identity = None
                    try:
                        calibration = None
                        calibration_reason = "missing-calibration"
                        if getattr(args, "calibration", None) and getattr(args, "ownership", None):
                            try:
                                calibration = load_calibration(args.calibration, args.ownership, args.manifest,
                                                               args.source_sha, args.source_tree, args.udid)
                            except (CalibrationError, OSError, ValueError, KeyError, TypeError) as error:
                                calibration_reason = str(error)[:120]
                        report["hostCalibration"] = {"verified": calibration is not None,
                            "reason": "verified-current-job-host" if calibration else calibration_reason,
                            "legacyVerificationRequired": calibration is None}
                        if calibration is not None:
                            container_state = "host-check-failed"
                            report["containerState"] = container_state
                            identity = verify_local_target(assessment=assessment,
                                udid=args.udid, bundle_id=args.bundle_id,
                                manifest_path=args.manifest, expected_sha=args.source_sha, expected_tree=args.source_tree,
                                app_container=app, data_container=data, process_rows=probe.processes(),
                                own_uid=os.getuid(), device_root=Path.home() / "Library/Developer/CoreSimulator/Devices" / args.udid,
                                run_started=run_started, now=time.time(), prior_identity=identities.get(key),
                                process_scan=getattr(probe, "last_process_scan", None), calibration=calibration)
                            container_state = "host-verified"
                        else:
                            # No calibration is permission to skip the original live proof.
                            # This is the original6410 ownership route, including its timeouts.
                            try:
                                current_containers = probe.containers()
                            except (OSError, subprocess.SubprocessError, MonitorUnavailable):
                                container_state = "lookup-failed"
                                report["containerState"] = container_state
                                raise
                            if current_containers != cached:
                                container_state = "changed"
                                report["containerState"] = container_state
                                raise MonitorUnavailable("container-changed")
                            container_state = "stable"
                            report["containerState"] = container_state
                            identity = verify_target(udid=args.udid, bundle_id=args.bundle_id,
                                manifest_path=args.manifest, expected_sha=args.source_sha, expected_tree=args.source_tree,
                                device_rows=probe.devices(), app_container=app, data_container=data,
                                process_rows=probe.processes(), journal_path=assessment.journal_path,
                                own_uid=os.getuid(), device_root=Path.home() / "Library/Developer/CoreSimulator/Devices" / args.udid,
                                journal_first_time=assessment.first_time, prior_identity=identities.get(key),
                                process_scan=getattr(probe, "last_process_scan", None))
                        identity_finished = time.monotonic()
                        report["containerState"] = container_state
                        identities[key] = identity
                        owned_key = key + f":{identity.pid}:{identity.started}"
                        if sampled.get(owned_key, 0) < 2:
                            # Count attempts before invoking sample, including command failures.
                            sampled[owned_key] = sampled.get(owned_key, 0) + 1
                            sampled[key] = sampled.get(key, 0) + 1
                            last_sample_at[key] = time.monotonic()
                            attempt_index += 1
                            used_bytes = sum(p.stat().st_size for p in out.iterdir() if p.is_file())
                            sample = capture_sample(probe, identity, out, attempt_index,
                                                    MAX_SECONDS - (time.monotonic() - start), used_bytes)
                            sample.update(session=assessment.session, phase=assessment.phase,
                                          gapSeconds=assessment.gap_seconds,
                                          elapsedSeconds=assessment.elapsed_seconds, process=asdict(identity))
                            report["samples"].append(sample)
                            report["status"] = "sampled" if sample["exit"] == 0 else "sample-command-failed"
                    except (OSError, ValueError, subprocess.SubprocessError, MonitorUnavailable) as error:
                        message = f"{type(error).__name__}:{error}"[:400]
                        record_diagnostic(str(error), container_state, assessment,
                                          getattr(error, "details", None))
                        if message not in report["errors"] and len(report["errors"]) < 32:
                            report["errors"].append(message)
                        report["status"] = "unavailable"
                        last_sample_at[key] = time.monotonic()
                    finally:
                        if len(report["identityChecks"]) < 32:
                            report["identityChecks"].append({
                                "method": "calibrated-local-host-proof" if calibration else "legacy-live-simctl-proof", "session": assessment.session,
                                "phase": assessment.phase, "result": "verified" if identity else "rejected",
                                "pid": identity.pid if identity else None,
                                "wallSeconds": (identity_finished if identity_finished is not None else time.monotonic()) - identity_started,
                                "appPathDigest": hashlib.sha256(str(app).encode("utf8")).hexdigest(),
                                "dataPathDigest": hashlib.sha256(str(data).encode("utf8")).hexdigest()})
            time.sleep(0.5)
        if time.monotonic() - start >= MAX_SECONDS:
            report["lastReason"] = "observer-time-limit"
        elif report["status"] == "unavailable" and not report["errors"] and report["lastReason"] in {
                "no-journal", "empty-journal", "before-profile", "startup-under-threshold",
                "no-gap", "phase-ended"}:
            report["status"] = "no-sample"
    except Exception as error:
        traceback.print_exc()
        report["status"] = "unavailable"
        report["lastReason"] = "observer-error"
        report["errors"].append(f"{type(error).__name__}:{error}"[:400])
    finally:
        report["finishedWall"] = time.time()
        report["wallSeconds"] = time.monotonic() - start
        report["observerCpuSeconds"] = time.process_time() - start_cpu
        with (out / "monitor-report.json").open("x", encoding="utf8") as stream:
            json.dump(report, stream, indent=2, sort_keys=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("udid", "bundle-id", "manifest", "source-sha", "source-tree", "output-dir", "stop-file"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--calibration")
    parser.add_argument("--ownership")
    run_observer(parser.parse_args())


if __name__ == "__main__":
    main()
