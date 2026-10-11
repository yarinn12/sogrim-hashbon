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


MAX_BYTES = 64 * 1024 * 1024
MAX_SECONDS = 600
GAP_SECONDS = 5
SESSION_FILE = re.compile(r"native-parity-status-([0-9A-Fa-f-]{36})\.log\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
UDID = re.compile(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\Z")


class MonitorUnavailable(Exception):
    """Evidence is insufficient to identify an owned sample target."""


@dataclass(frozen=True)
class Assessment:
    eligible: bool
    reason: str
    session: str = ""
    phase: str = ""
    gap_seconds: float = 0.0
    journal_path: Path | None = None
    first_time: float = 0.0


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
    """Return a candidate only for a current session's >5 s pre-keyboard gap."""
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
        return Assessment(False, "before-profile", session=session, journal_path=path, first_time=times[0])
    gap = now - times[-1]
    if gap <= GAP_SECONDS:
        return Assessment(False, "no-gap", session=session, phase="profile-to-keyboard", gap_seconds=gap, journal_path=path, first_time=times[0])
    return Assessment(True, "gap", session=session, phase="profile-to-keyboard", gap_seconds=gap, journal_path=path, first_time=times[0])


def verify_target(*, udid, bundle_id, manifest_path, expected_sha, expected_tree,
                  device_rows, app_container, data_container, process_rows,
                  journal_path, own_uid, device_root, journal_first_time=None, prior_identity=None):
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
    if len(matching) != 1:
        raise MonitorUnavailable("app-pid-not-unique")
    process = matching[0]
    if process.pid <= 0 or process.uid != own_uid or not process.started or process.start_epoch <= 0:
        raise MonitorUnavailable("app-pid-not-owned")
    if journal_first_time is not None and process.start_epoch > journal_first_time + 1:
        raise MonitorUnavailable("journal-predates-app-process")
    if prior_identity is not None and process != prior_identity:
        raise MonitorUnavailable("app-pid-reused-or-changed")
    return process


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
        output = self.command(["ps", "-axo", "pid=,uid=,lstart=,command="])
        rows = []
        pattern = re.compile(r"^\s*(\d+)\s+(\d+)\s+((?:\S+\s+){4}\S+)\s+(.+)$")
        for line in output.splitlines():
            match = pattern.match(line)
            if match:
                try:
                    start_epoch = datetime.strptime(match[3], "%a %b %d %H:%M:%S %Y").timestamp()
                except ValueError:
                    continue
                rows.append(ProcessIdentity(int(match[1]), int(match[2]), match[3], match[4], start_epoch))
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
              "status": "unavailable", "lastReason": "not-started", "samples": [], "errors": []}
    start = time.monotonic()
    start_cpu = time.process_time()
    run_started = report["startedWall"]
    probe = probe or DarwinProbe(args.udid, args.bundle_id)
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
                except (OSError, subprocess.SubprocessError, MonitorUnavailable) as error:
                    report["lastReason"] = f"container-unavailable:{error}"
                    time.sleep(0.5)
                    continue
            app, data = cached
            assessment = assess_journal(data / "Documents", args.source_sha, args.source_tree, run_started, time.time())
            report["lastReason"] = assessment.reason
            if assessment.eligible:
                key = assessment.session + ":" + assessment.phase
                if sampled.get(key, 0) < 2 and time.monotonic() - last_sample_at.get(key, 0) >= 2:
                    try:
                        if probe.containers() != cached:
                            raise MonitorUnavailable("container-changed")
                        identity = verify_target(udid=args.udid, bundle_id=args.bundle_id,
                            manifest_path=args.manifest, expected_sha=args.source_sha, expected_tree=args.source_tree,
                            device_rows=probe.devices(), app_container=app, data_container=data,
                            process_rows=probe.processes(), journal_path=assessment.journal_path,
                            own_uid=os.getuid(), device_root=Path.home() / "Library/Developer/CoreSimulator/Devices" / args.udid,
                            journal_first_time=assessment.first_time, prior_identity=identities.get(key))
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
                                          gapSeconds=assessment.gap_seconds, process=asdict(identity))
                            report["samples"].append(sample)
                            report["status"] = "sampled" if sample["exit"] == 0 else "sample-command-failed"
                    except (OSError, ValueError, subprocess.SubprocessError, MonitorUnavailable) as error:
                        message = f"{type(error).__name__}:{error}"[:400]
                        if message not in report["errors"] and len(report["errors"]) < 32:
                            report["errors"].append(message)
                        report["status"] = "unavailable"
                        last_sample_at[key] = time.monotonic()
            time.sleep(0.5)
        if time.monotonic() - start >= MAX_SECONDS:
            report["lastReason"] = "observer-time-limit"
        elif report["status"] == "unavailable" and not report["errors"] and report["lastReason"] in {
                "no-journal", "empty-journal", "before-profile", "no-gap", "phase-ended"}:
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
    run_observer(parser.parse_args())


if __name__ == "__main__":
    main()
