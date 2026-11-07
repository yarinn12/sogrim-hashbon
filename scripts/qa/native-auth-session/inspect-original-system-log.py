#!/usr/bin/env python3
"""Bounded, read-only decoding of the original Auth76 exported system log archive."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shutil
import subprocess
import sys
import time

SOURCE = Path(__file__).with_name("inspect-original-xcresult.py")
SPEC = importlib.util.spec_from_file_location("auth76_original_result", SOURCE)
ORIGINAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORIGINAL)

UDID = "DD0F04E6-F694-4A74-AB2C-70453176B7BB"
START_UTC = "2026-11-07 17:50:20"
END_UTC = "2026-11-07 17:51:40"
PROCESSES = ("SafariViewService", "App", "runningboardd", "SpringBoard", "launchd_sim", "swcd")
PREDICATE = " OR ".join('process == "' + name + '"' for name in PROCESSES)
PRIVATE_NAME = "auth76-system-log-private"
MAX_ARCHIVE_FILES = 1000
MAX_ARCHIVE_BYTES = 350_000_000
MAX_ARCHIVE_FILE_BYTES = 200_000_000
HELP_BYTES = 1_000_000
EXPORT_STDOUT_BYTES = 2_000_000
LOG_STDOUT_BYTES = 30_000_000
STDERR_BYTES = 2_000_000
HELP_SECONDS = 20
EXPORT_SECONDS = 240
LOG_SECONDS = 180


class InspectionError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise InspectionError(reason)


def clean_environment(source):
    return {
        "PATH": source.get("PATH", "/usr/bin:/bin"),
        "HOME": source.get("HOME", ""),
        "TMPDIR": source.get("TMPDIR", "/tmp"),
        "DEVELOPER_DIR": source.get("DEVELOPER_DIR", ""),
        "TZ": "UTC",
        "LANG": "en_US.UTF-8",
    }


def validate_private_root(root, environment):
    root = Path(root).absolute()
    expected = Path(environment["RUNNER_TEMP"]).absolute() / PRIVATE_NAME
    require(root == expected and root.name == PRIVATE_NAME, "private root is not task-owned runner temp")
    require(root.is_dir() and not root.is_symlink(), "private root absent or symlinked")
    if hasattr(os, "getuid"):
        require(root.stat().st_uid == os.getuid(), "private root owner mismatch")
    return root


def validate_archive_path(export_root, candidate):
    export_root = Path(export_root).absolute()
    candidate = Path(candidate).absolute()
    require(export_root.is_dir() and not export_root.is_symlink(), "diagnostics export root absent or symlinked")
    try:
        relative = candidate.relative_to(export_root)
    except ValueError as error:
        raise InspectionError("archive outside diagnostics export") from error
    require(relative.parts[-3:] == ("simctl_diagnostics", UDID, "system.logarchive"), "archive UDID or structure mismatch")
    cursor = export_root
    for part in relative.parts:
        cursor = cursor / part
        require(not cursor.is_symlink(), "symlink in archive path")
    require(candidate.is_dir(), "system.logarchive is not a directory")
    require(candidate.resolve(strict=True).is_relative_to(export_root.resolve(strict=True)), "resolved archive escapes diagnostics export")
    return candidate


def select_archive(export_root):
    export_root = Path(export_root).absolute()
    require(export_root.is_dir() and not export_root.is_symlink(), "diagnostics export root absent or symlinked")
    archives = []
    for current, directories, files in os.walk(export_root, followlinks=False):
        for name in directories + files:
            entry = Path(current) / name
            require(not entry.is_symlink(), "symlink in diagnostics export")
            if name == "system.logarchive":
                archives.append(entry)
    require(len(archives) == 1, "expected exactly one original system.logarchive")
    return validate_archive_path(export_root, archives[0])


def fingerprint_archive(archive):
    archive = Path(archive)
    tree_hash = hashlib.sha256()
    count = 0
    total = 0
    for current, directories, files in os.walk(archive, followlinks=False):
        directories.sort()
        for name in directories + files:
            require(not (Path(current) / name).is_symlink(), "symlink inside system.logarchive")
        for name in sorted(files):
            file = Path(current) / name
            require(file.is_file(), "non-file in system.logarchive")
            size = file.stat().st_size
            count += 1
            total += size
            require(count <= MAX_ARCHIVE_FILES and size <= MAX_ARCHIVE_FILE_BYTES and total <= MAX_ARCHIVE_BYTES, "system.logarchive size limit")
            digest = hashlib.sha256()
            with file.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            relative = file.relative_to(archive).as_posix()
            tree_hash.update(relative.encode("utf-8") + b"\0" + str(size).encode("ascii") + b"\0" + digest.digest())
    require(count > 0, "empty system.logarchive")
    return {"files": count, "bytes": total, "treeSha256": tree_hash.hexdigest()}


def validate_log_help(help_text):
    require(re.search(r"(?m)^usage:\s+log show \[options\] <archive>\s*$", help_text),
            "log help show lacks positional archive usage")
    require(re.search(r"(?m)^\s*or:\s+log show \[options\]\s*$", help_text),
            "log help show lacks live-store contrast")
    for option in ("--start", "--end", "--predicate", "--style", "--timezone"):
        require(re.search(r"(?<![A-Za-z])" + re.escape(option) + r"\b", help_text),
                "log help show lacks " + option)
    for option in ("--[no-]info", "--[no-]debug"):
        require(option in help_text, "log help show lacks " + option)
    for section in ("options:", "valid time formats:", "predicate usage:", "shorthand usage:"):
        require(section in help_text, "log help show incomplete: " + section)
    require(re.search(r"--style <style>.*\bjson\b", help_text), "log help show lacks json style")
    return True


def validate_log_help_result(result, help_text):
    require(not result["timedOut"] and not result["outputTruncated"], "log help show incomplete by bound")
    require(result["exitCode"] in (0, 64), "log help show exit status unavailable")
    return validate_log_help(help_text)


def log_show_argv(archive):
    archive = Path(archive)
    require(archive.is_absolute() and archive.parts[-3:] == ("simctl_diagnostics", UDID, "system.logarchive"),
            "explicit original archive required")
    return [
        "/usr/bin/log", "show",
        "--start", START_UTC + "+0000", "--end", END_UTC + "+0000",
        "--predicate", PREDICATE, "--timezone", "UTC", "--style", "json", "--info", "--debug",
        str(archive),
    ]


def validate_command(argv):
    if argv == ["/usr/bin/xcrun", "xcresulttool", "--version"]:
        return
    if argv == ["/usr/bin/xcrun", "xcresulttool", "help", "export", "diagnostics"]:
        return
    if len(argv) == 8 and argv[:4] == ["/usr/bin/xcrun", "xcresulttool", "export", "diagnostics"]:
        require(argv[4] == "--path" and argv[6] == "--output-path", "xcresulttool export arguments")
        require(Path(argv[5]).is_absolute() and Path(argv[5]).name == "result.xcresult", "foreign result bundle")
        require(Path(argv[7]).is_absolute() and Path(argv[7]).name == "diagnostics-export", "foreign diagnostics destination")
        return
    if argv == ["/usr/bin/log", "help", "show"]:
        return
    if len(argv) == 15 and argv[:2] == ["/usr/bin/log", "show"]:
        require(argv == log_show_argv(Path(argv[-1])), "log show arguments changed")
        return
    raise InspectionError("forbidden or live-log command")

def log_event_count(stdout_bytes):
    try:
        content = stdout_bytes.decode("utf-8").strip()
        if not content:
            return 0
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            parsed = [json.loads(line) for line in content.splitlines() if line.strip()]
        if isinstance(parsed, list):
            return sum(isinstance(item, dict) and any(key in item for key in ("timestamp", "eventMessage", "process", "processID")) for item in parsed)
        if isinstance(parsed, dict):
            if isinstance(parsed.get("events"), list):
                return len(parsed["events"])
            return int(any(key in parsed for key in ("timestamp", "eventMessage", "process", "processID")))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return None

def output_status(exit_code, stdout_bytes, timed_out, truncated):
    if timed_out:
        return "INCOMPLETE_TIMEOUT"
    if truncated:
        return "INCOMPLETE_OUTPUT_CAP"
    if exit_code != 0:
        return "UNAVAILABLE_COMMAND_FAILED"
    events = log_event_count(stdout_bytes)
    if events is None:
        return "UNPARSEABLE"
    if events == 0:
        return "EMPTY"
    return "AVAILABLE"


def run_bounded(argv, raw_dir, label, seconds, stdout_limit, stderr_limit, environment):
    validate_command(argv)
    raw_dir = Path(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    paths = {"stdout": raw_dir / (label + ".stdout"), "stderr": raw_dir / (label + ".stderr")}
    limits = {"stdout": stdout_limit, "stderr": stderr_limit}
    sizes = {"stdout": 0, "stderr": 0}
    started = time.monotonic()
    deadline = started + seconds
    timed_out = False
    truncated = False
    try:
        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment, close_fds=True)
    except OSError as error:
        raise InspectionError("required read-only command unavailable") from error
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ, "stdout")
    selector.register(child.stderr, selectors.EVENT_READ, "stderr")
    try:
        with paths["stdout"].open("xb") as stdout, paths["stderr"].open("xb") as stderr:
            sinks = {"stdout": stdout, "stderr": stderr}
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    timed_out = True
                    break
                for key, _ in selector.select(timeout=min(remaining, 0.5)):
                    name = key.data
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                        continue
                    room = limits[name] - sizes[name]
                    sinks[name].write(chunk[:max(0, room)])
                    sizes[name] += min(len(chunk), max(0, room))
                    if len(chunk) > room:
                        truncated = True
                        break
                if truncated:
                    break
        if timed_out or truncated:
            child.kill()  # Only the read-only child started above; never a simulator/app process.
        try:
            exit_code = child.wait(timeout=10)
        except subprocess.TimeoutExpired as error:
            child.kill()
            child.wait(timeout=10)
            raise InspectionError("read-only child did not stop after bound") from error
    finally:
        selector.close()
        for pipe in (child.stdout, child.stderr):
            if pipe and not pipe.closed:
                pipe.close()
    return {
        "argv": argv,
        "exitCode": exit_code,
        "durationMs": round((time.monotonic() - started) * 1000),
        "timeoutSeconds": seconds,
        "stdoutLimitBytes": stdout_limit,
        "stderrLimitBytes": stderr_limit,
        "timedOut": timed_out,
        "outputTruncated": truncated,
        "rawPaths": paths,
        "rawBytes": sizes,
    }


def publish_result(result, report_dir):
    report_dir = Path(report_dir)
    published = {key: value for key, value in result.items() if key not in ("rawPaths", "rawBytes")}
    for stream, original_path in result["rawPaths"].items():
        target = report_dir / (original_path.name)
        shutil.copyfile(original_path, target)
        evidence = ORIGINAL.sanitize_output_file(target)
        if not evidence["textSanitized"]:
            target.unlink()
            published[stream] = {
                "file": None, "bytes": result["rawBytes"][stream],
                "rawSha256": evidence["rawSha256"], "publishedSha256": None,
                "textSanitized": False, "withheld": True,
            }
            continue
        published[stream] = {"file": target.name, "bytes": result["rawBytes"][stream], **evidence}
    return published


def inspect(private_root, report_root, environment):
    private_root = validate_private_root(private_root, environment)
    report_root = Path(report_root).absolute()
    require(report_root.is_dir() and not report_root.is_symlink(), "report root absent or symlinked")
    previous = ORIGINAL.read_json(report_root / "archive-validation.json")
    require(previous.get("archiveValidated") is True and previous.get("archiveSha256") == ORIGINAL.ZIP_SHA256 and previous.get("safeExtraction") is True, "original ZIP extraction gate absent")
    result_bundle = private_root / "extracted" / "result.xcresult"
    require((result_bundle / "Info.plist").is_file() and not result_bundle.is_symlink(), "original result bundle absent")
    require(environment.get("DEVELOPER_DIR") == "/Applications/Xcode_26.6.app/Contents/Developer", "Xcode 26.6 selection mismatch")
    output = report_root / "system-log"
    require(not output.exists(), "system-log output already exists")
    output.mkdir()
    raw = private_root / "command-output"
    export = private_root / "diagnostics-export"
    require(not export.exists() and not raw.exists(), "task diagnostic temp already exists")
    manifest = {
        "label": "READ_ONLY_ORIGINAL_EVIDENCE",
        "sourceRunId": ORIGINAL.RUN_ID,
        "sourceAttempt": 1,
        "sourceArtifactId": ORIGINAL.ARTIFACT_ID,
        "sourceSha": ORIGINAL.SOURCE_SHA,
        "windowStartUtc": START_UTC + "Z",
        "windowEndUtc": END_UTC + "Z",
        "predicate": PREDICATE,
        "timeZone": "UTC",
        "macOSVersion": platform.mac_ver()[0],
        "releaseAcceptance": False,
        "originalTestPassed": False,
        "causeDetermined": False,
        "readinessAccepted": False,
        "commands": [],
        "status": "UNAVAILABLE",
    }
    env = clean_environment(environment)
    try:
        steps = (
            ("xcresult-version", ["/usr/bin/xcrun", "xcresulttool", "--version"], HELP_SECONDS, HELP_BYTES),
            ("xcresult-export-help", ["/usr/bin/xcrun", "xcresulttool", "help", "export", "diagnostics"], HELP_SECONDS, HELP_BYTES),
        )
        for label, argv, seconds, cap in steps:
            result = run_bounded(argv, raw, label, seconds, cap, STDERR_BYTES, env)
            manifest["commands"].append(publish_result(result, output))
            require(result["exitCode"] == 0 and not result["timedOut"] and not result["outputTruncated"], label + " unavailable")
        manifest["xcresulttoolVersion"] = ((output / "xcresult-version.stdout").read_text(encoding="utf-8") + (output / "xcresult-version.stderr").read_text(encoding="utf-8")).strip()[:256]
        require(manifest["xcresulttoolVersion"], "xcresulttool version unavailable")
        export_help = (raw / "xcresult-export-help.stdout").read_text(encoding="utf-8", errors="replace") + (raw / "xcresult-export-help.stderr").read_text(encoding="utf-8", errors="replace")
        require("--path" in export_help and "--output-path" in export_help, "xcresulttool export diagnostics syntax unavailable")
        export_result = run_bounded(
            ["/usr/bin/xcrun", "xcresulttool", "export", "diagnostics", "--path", str(result_bundle), "--output-path", str(export)],
            raw, "xcresult-export", EXPORT_SECONDS, EXPORT_STDOUT_BYTES, STDERR_BYTES, env,
        )
        manifest["commands"].append(publish_result(export_result, output))
        require(export_result["exitCode"] == 0 and not export_result["timedOut"] and not export_result["outputTruncated"], "xcresulttool diagnostics export incomplete")
        archive = select_archive(export)
        archive_fingerprint = fingerprint_archive(archive)
        manifest["archive"] = {"relativePath": archive.relative_to(export).as_posix(), **archive_fingerprint}
        help_result = run_bounded(["/usr/bin/log", "help", "show"], raw, "log-help-show", HELP_SECONDS, HELP_BYTES, STDERR_BYTES, env)
        manifest["commands"].append(publish_result(help_result, output))
        help_text = help_result["rawPaths"]["stdout"].read_text(encoding="utf-8", errors="replace") + help_result["rawPaths"]["stderr"].read_text(encoding="utf-8", errors="replace")
        validate_log_help_result(help_result, help_text)
        argv = log_show_argv(archive)
        decoded = run_bounded(argv, raw, "log-show", LOG_SECONDS, LOG_STDOUT_BYTES, STDERR_BYTES, env)
        manifest["commands"].append(publish_result(decoded, output))
        status = output_status(decoded["exitCode"], decoded["rawPaths"]["stdout"].read_bytes(), decoded["timedOut"], decoded["outputTruncated"])
        manifest["status"] = status
        manifest["eventCount"] = log_event_count(decoded["rawPaths"]["stdout"].read_bytes())
        require(status == "AVAILABLE", "original archive log query " + status)
    except InspectionError as error:
        manifest["failureReason"] = str(error)
        raise
    finally:
        ORIGINAL.write_json(output / "manifest.json", manifest)
    return manifest


def main(argv):
    require(len(argv) == 4 and argv[1] == "inspect", "usage: inspect PRIVATE_ROOT REPORT_ROOT")
    inspect(argv[2], argv[3], os.environ)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (InspectionError, OSError, ValueError, KeyError) as error:
        print("ORIGINAL_LOG_UNAVAILABLE: " + str(error), file=sys.stderr)
        sys.exit(1)