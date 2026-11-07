#!/usr/bin/env python3
"""One bounded read of the original Auth79 AX-startup daemon/runner archive.

No simulator/App/XCTest execution. Reuse the immutable original ZIP/metadata and
system-log safety contracts in private module instances, leaving Auth76 intact.
"""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ORIGINAL = load("auth79_original_identity", "inspect-auth79-original.py")
BASE = load("auth79_system_log_base", "inspect-original-system-log.py")
BASE.ORIGINAL = ORIGINAL
BASE.UDID = "D17006FC-9379-4556-89A2-DEA0B0B50D28"
BASE.START_UTC = "2026-11-07 23:02:21"
BASE.END_UTC = "2026-11-07 23:03:54"
BASE.PROCESSES = ("AuthProbeUITests-Runner", "testmanagerd")
TARGETS = {"AuthProbeUITests-Runner": 35064, "testmanagerd": 34398}
BASE.PREDICATE = "(" + " OR ".join(
    '(process == "' + name + '" AND processID == ' + str(pid) + ')'
    for name, pid in TARGETS.items()) + ")"
BASE.PRIVATE_NAME = "auth79-daemon-log-private"
InspectionError = BASE.InspectionError
SESSION = "43C8D436-2E13-4079-AA6B-B90F5AF3CE26"
MAX_PROOF_FILES = 3000
MAX_PROOF_BYTES = 16_000_000
MAX_PROOF_FILE = 2_000_000
RAW_SELECT = BASE.select_archive
EXPORT_PROOF = None


def __getattr__(name):
    return getattr(BASE, name)


def select_archive(export_root):
    """Require one exact-UDID archive and an original-session runner log.

    Discover the bounded text evidence by content, not an assumed diagnostics
    directory or the first archive. No opaque/private object-store parser.
    """
    global EXPORT_PROOF
    EXPORT_PROOF = None
    archive = RAW_SELECT(export_root)
    root = Path(export_root).absolute()
    required = ("Beginning test session AuthProbeUITests-" + SESSION, BASE.UDID,
                "AuthProbeUITests-Runner[35064:", "XCTDaemonErrorDomain Code=18",
                "Timed out waiting for AX loaded notification", "Xcode version: 26.6 (17F113)")
    matches, count, total = [], 0, 0
    for current, dirs, files in os.walk(root, followlinks=False):
        dirs.sort()
        dirs[:] = [name for name in dirs if not name.endswith(".logarchive")]
        for name in sorted(files):
            path = Path(current) / name
            BASE.require(not path.is_symlink() and path.is_file(), "non-file runner proof candidate")
            count += 1
            BASE.require(count <= MAX_PROOF_FILES, "runner proof file-count cap")
            with path.open("rb") as stream:
                prefix = stream.read(8192)
            total += len(prefix)
            BASE.require(total <= MAX_PROOF_BYTES, "runner proof byte cap")
            # Prefix is candidate discovery only and may end inside a UTF8
            # character. The complete proof file is decoded strictly below.
            header = prefix.decode("utf-8-sig", errors="replace")
            if SESSION not in header or BASE.UDID not in header:
                continue
            size = path.stat().st_size
            BASE.require(size <= MAX_PROOF_FILE, "runner proof file cap")
            raw = path.read_bytes()
            total += len(raw)
            BASE.require(total <= MAX_PROOF_BYTES and len(raw) == size, "runner proof changed or byte cap")
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError as error:
                raise InspectionError("original-session runner proof is not UTF8") from error
            if all(token in text for token in required):
                matches.append(dict(relativePath=path.relative_to(root).as_posix(),bytes=len(raw),
                                    sha256=BASE.hashlib.sha256(raw).hexdigest()))
    BASE.require(matches, "original Auth79 runner/session evidence absent")
    EXPORT_PROOF = dict(sourceRunId=ORIGINAL.RUN_ID,sourceJobId=ORIGINAL.JOB_ID,udid=BASE.UDID,
                        runnerPid=35064,sessionIdentifier=SESSION,runnerLogs=matches,
                        archiveRelativePath=archive.relative_to(root).as_posix())
    return archive


BASE.select_archive = select_archive


def verified_events(stdout, expected_archive):
    """Use the existing strict JSON/footer gate, then validate the fixed scope.

    This adds Auth79 event checks; it does not alter the established footer or
    help parser. A missing/unknown format never provides diagnostic availability.
    """
    expected = str(expected_archive) if expected_archive is not None else ""
    suffix = ("simctl_diagnostics", BASE.UDID, "system.logarchive")
    posix, local = PurePosixPath(expected), Path(expected)
    BASE.require((posix.is_absolute() and posix.parts[-3:] == suffix)
                 or (local.is_absolute() and local.parts[-3:] == suffix), "fixed Auth79 archive identity absent")
    count = BASE.log_event_count(stdout, expected_archive=expected_archive)
    BASE.require(count is not None, "unparseable or incomplete original archive JSON")
    content = stdout.decode("utf8")
    if not content.strip():
        return []
    footer = "==========\n" + str(expected_archive) + "\n==========\n"
    if content.endswith(footer):
        content = content[:-len(footer)]
    try:
        events = json.loads(content)
    except json.JSONDecodeError:
        events = [json.loads(line) for line in content.splitlines() if line.strip()]
    if isinstance(events, dict) and isinstance(events.get("events"), list):
        events = events["events"]
    elif isinstance(events, dict):
        events = [events]
    BASE.require(isinstance(events, list), "original archive event array absent")
    start = datetime.strptime(BASE.START_UTC, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    end = datetime.strptime(BASE.END_UTC, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    for event in events:
        BASE.require(isinstance(event, dict), "non-event in archive query")
        value = event.get("timestamp")
        BASE.require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{1,6}\+0000", value),
                     "unknown event timestamp or non-UTC output")
        try:
            stamp = datetime.strptime(value, "%Y-%m-%d %H:%M:%S.%f%z")
        except ValueError as error:
            raise InspectionError("invalid event timestamp") from error
        BASE.require(start <= stamp < end, "event outside fixed AX window")
        image = event.get("processImagePath")
        BASE.require(isinstance(image, str) and image.startswith("/"), "event process image absent")
        name = PurePosixPath(image).name
        BASE.require(name in TARGETS and type(event.get("processID")) is int and event["processID"] == TARGETS[name],
                     "foreign process or PID in original archive output")
        BASE.require(isinstance(event.get("eventMessage"), str) and bool(event["eventMessage"].strip()),
                     "event message absent")
    BASE.require(len(events) == count, "event count/schema mismatch")
    return events


RAW_STATUS = BASE.output_status


def output_status(exit_code, stdout, timed_out, truncated, expected_archive=None):
    status = RAW_STATUS(exit_code, stdout, timed_out, truncated, expected_archive=expected_archive)
    if status != "AVAILABLE":
        return status
    try:
        verified_events(stdout, expected_archive)
    except (InspectionError, UnicodeDecodeError, ValueError, TypeError):
        return "UNAVAILABLE_EVENT_SCOPE_OR_FORMAT"
    return status


BASE.output_status = output_status


def inspect(private_root, report_root, environment):
    global EXPORT_PROOF
    EXPORT_PROOF = None
    private_root = BASE.validate_private_root(private_root, environment)
    report_root = Path(report_root).absolute()
    metadata = ORIGINAL.read_json(report_root / "metadata-validation.json")
    for key, expected in (
        ("metadataValidated", True), ("sourceRunId", ORIGINAL.RUN_ID), ("sourceAttempt", 1),
        ("sourceJobId", ORIGINAL.JOB_ID), ("sourceArtifactId", ORIGINAL.ARTIFACT_ID),
        ("sourceCommit", ORIGINAL.SOURCE_SHA), ("artifactSha256", ORIGINAL.ZIP_SHA256),
        ("artifactBytes", ORIGINAL.ZIP_BYTES), ("sourceConclusion", "failure"),
    ):
        BASE.require(metadata.get(key) == expected, "Auth79 metadata gate mismatch: " + key)
    ORIGINAL.validate_archive(private_root / "original.zip")
    output = report_root / "system-log"
    manifest = None
    try:
        manifest = BASE.inspect(private_root, report_root, environment)
    finally:
        # Retain the original reader's failure manifest; add context without
        # converting a failed/empty/truncated query into successful evidence.
        path = output / "manifest.json"
        if path.is_file():
            manifest = ORIGINAL.read_json(path)
            manifest.update(sourceTree=ORIGINAL.SOURCE_TREE,sourceJobId=ORIGINAL.JOB_ID,
                            purpose="original Auth79 AX startup; no replay",targets=TARGETS,
                            originalSessionIdentifier=SESSION,exportProvenance=EXPORT_PROOF,
                            originalFunctionalCasesObserved=0,officialSummaryTestCount=None,
                            productCauseProven=False,sameCauseAsArmParityProven=False)
            ORIGINAL.write_json(path, manifest)
    return manifest


def main(argv):
    BASE.require(len(argv) == 4 and argv[1] == "inspect", "usage: inspect PRIVATE_ROOT REPORT_ROOT")
    inspect(argv[2], argv[3], os.environ)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (InspectionError, ORIGINAL.EvidenceError, OSError, ValueError, KeyError) as error:
        print("AUTH79_ORIGINAL_LOG_UNAVAILABLE: " + str(error), file=sys.stderr)
        sys.exit(1)
