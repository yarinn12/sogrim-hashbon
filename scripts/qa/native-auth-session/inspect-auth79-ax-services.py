#!/usr/bin/env python3
"""Read the same original Auth79 archive, including its AX service namespace.

Diagnostic availability only: no new App/XCTest run, release acceptance or
claim that notification 3031 caused the original initialization timeout.
All original identity, export, bounds, help, footer and redaction readers stay
unchanged in a private module instance. Only event selection/scope is extended.
"""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys


SPEC = importlib.util.spec_from_file_location(
    "auth79_ax_services_original_reader", Path(__file__).with_name("inspect-auth79-daemon-log.py"))
READER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(READER)
BASE = READER.BASE
ORIGINAL = READER.ORIGINAL
InspectionError = READER.InspectionError
TARGETS = READER.TARGETS
AX_NAMESPACE = "com.apple.Accessibility"
BASE.PREDICATE = "(" + BASE.PREDICATE + ' OR subsystem BEGINSWITH[c] "' + AX_NAMESPACE + '")'
BASE.PRIVATE_NAME = "auth79-ax-services-private"


def __getattr__(name):
    return getattr(READER, name)


def verified_events(stdout, expected_archive):
    """Retain the original JSON/footer gate and extend only event scope.

    Original process names and PIDs are paired before considering namespace.
    An AX subsystem cannot admit a foreign PID for either original actor.
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
        BASE.require(isinstance(image, str) and image.startswith("/") and "\0" not in image,
                     "event process image absent")
        name = PurePosixPath(image).name
        BASE.require(name not in ("", ".", "..") and not image.endswith("/"), "event process image invalid")
        pid = event.get("processID")
        BASE.require(type(pid) is int and pid > 0, "event PID absent or invalid")
        if name in TARGETS or pid in TARGETS.values():
            BASE.require(name in TARGETS and pid == TARGETS[name], "foreign PID or image for original actor")
        else:
            subsystem = event.get("subsystem")
            BASE.require(isinstance(subsystem, str) and subsystem.lower().startswith(AX_NAMESPACE.lower()),
                         "foreign actor outside AX namespace")
        BASE.require(isinstance(event.get("eventMessage"), str) and bool(event["eventMessage"].strip()),
                     "event message absent")
    BASE.require(len(events) == count, "event count/schema mismatch")
    return events


def output_status(exit_code, stdout, timed_out, truncated, expected_archive=None):
    status = READER.RAW_STATUS(exit_code, stdout, timed_out, truncated, expected_archive=expected_archive)
    if status != "AVAILABLE":
        return status
    try:
        verified_events(stdout, expected_archive)
    except (InspectionError, UnicodeDecodeError, ValueError, TypeError):
        return "UNAVAILABLE_EVENT_SCOPE_OR_FORMAT"
    return status


BASE.output_status = output_status


def inspect(private_root, report_root, environment):
    manifest = None
    try:
        manifest = READER.inspect(private_root, report_root, environment)
    finally:
        path = Path(report_root).absolute() / "system-log/manifest.json"
        if path.is_file():
            manifest = ORIGINAL.read_json(path)
            manifest.update(purpose="original Auth79 AX service evidence; no replay",
                            originalTargets=TARGETS,additionalActorSubsystemPrefix=AX_NAMESPACE,
                            additionalActorSubsystemMatch="BEGINSWITH[c]",
                            newAppOrXCTestRun=False,releaseAcceptance=False,
                            productCauseProven=False,causeDetermined=False)
            ORIGINAL.write_json(path, manifest)
    return manifest


def main(argv):
    BASE.require(len(argv) == 4 and argv[1] == "inspect", "usage: inspect PRIVATE_ROOT REPORT_ROOT")
    inspect(argv[2], argv[3], os.environ)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (InspectionError, ORIGINAL.EvidenceError, OSError, ValueError, KeyError) as error:
        print("AUTH79_ORIGINAL_AX_SERVICES_UNAVAILABLE: " + str(error), file=sys.stderr)
        sys.exit(1)
