#!/usr/bin/env python3
"""Inventory only preexisting Apple-exported diagnostics; never execute content.

No live collection, opaque-container parsing, App run or release acceptance.
Unknown, mixed-process, binary and out-of-window reports remain unavailable.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys

READERS = {"auth79": "inspect-auth79-ax-services.py", "native503": "inspect-native503-home-log.py"}
MAX_FILES = 3000
MAX_ENTRIES = 6000
MAX_FILE_BYTES = 8_000_000
MAX_TOTAL_BYTES = 32_000_000


class StackError(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise StackError(reason)


def load_reader(scenario):
    require(scenario in READERS, "unknown original scenario")
    spec = importlib.util.spec_from_file_location("stack_inventory_" + scenario,
                                                 Path(__file__).with_name(READERS[scenario]))
    reader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reader)
    return reader


def safe_path(root, relative):
    require(isinstance(relative, str) and relative and "\\" not in relative and not re.match(r"^[A-Za-z]:", relative)
            and "\0" not in relative, "unsafe relative diagnostics path")
    parts = relative.split("/")
    require(all(part not in ("", ".", "..") for part in parts), "unsafe diagnostics path parts")
    root = Path(root).absolute()
    require(root.is_dir() and not root.is_symlink(), "diagnostics root missing or symlinked")
    cursor = root
    for part in parts:
        cursor = cursor / part
        require(not cursor.is_symlink(), "symlink in diagnostics path")
    require(cursor.resolve(strict=True).is_relative_to(root.resolve(strict=True)), "diagnostics path escapes root")
    return cursor


def bounded_bytes(path, cap):
    require(path.is_file() and not path.is_symlink(), "non-file diagnostics input")
    before = path.stat()
    require(before.st_size <= cap, "diagnostics input byte cap")
    with path.open("rb") as stream:
        raw = stream.read(cap + 1)
    after = path.stat()
    require(len(raw) == before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns,
            "diagnostics input changed during read")
    return raw


def bind_original(reader, private_root, report_root, environment):
    r = reader.ORIGINAL
    private = reader.validate_private_root(private_root, environment)
    r.validate_archive(private / "original.zip")
    manifest = r.read_json(report_root / "system-log/manifest.json")
    for key, expected in (("status", "AVAILABLE"), ("sourceRunId", r.RUN_ID), ("sourceAttempt", 1),
                          ("sourceJobId", r.JOB_ID), ("sourceArtifactId", r.ARTIFACT_ID),
                          ("sourceSha", r.SOURCE_SHA), ("sourceTree", r.SOURCE_TREE),
                          ("originalSessionIdentifier", reader.SESSION), ("releaseAcceptance", False)):
        require(type(manifest.get(key)) is type(expected) and manifest[key] == expected,
                "original reader binding mismatch: " + key)
    extraction = r.read_json(report_root / "archive-validation.json")
    require(extraction.get("archiveValidated") is True and extraction.get("safeExtraction") is True
            and extraction.get("archiveSha256") == r.ZIP_SHA256, "original extraction proof absent")
    export = private / "diagnostics-export"
    exports = [c for c in manifest["commands"] if c.get("argv", [])[:4] ==
               ["/usr/bin/xcrun", "xcresulttool", "export", "diagnostics"]]
    require(len(exports) == 1 and exports[0].get("argv") == ["/usr/bin/xcrun", "xcresulttool", "export", "diagnostics",
            "--path", str(private/"extracted/result.xcresult"), "--output-path", str(export)]
            and exports[0].get("exitCode") == 0 and exports[0].get("timedOut") is False
            and exports[0].get("outputTruncated") is False, "original Apple export proof absent or incomplete")
    proof = manifest.get("exportProvenance") or {}
    for key, expected in (("sourceRunId", r.RUN_ID), ("sourceJobId", r.JOB_ID),
                          ("udid", reader.UDID), ("sessionIdentifier", reader.SESSION)):
        require(type(proof.get(key)) is type(expected) and proof[key] == expected,
                "original export/session proof mismatch: " + key)
    relative = manifest["archive"]["relativePath"]
    require(proof.get("archiveRelativePath") == relative, "export archive proof mismatch")
    archive = safe_path(export, relative)
    reader.validate_archive_path(export, archive)  # Path check only; never walk the logarchive.
    logs = proof.get("runnerLogs")
    require(isinstance(logs, list) and 0 < len(logs) <= reader.MAX_PROOF_FILES, "runner proof absent")
    total = 0
    for log in logs:
        require(not any(part.lower().endswith(".logarchive") for part in PurePosixPath(log["relativePath"]).parts),
                "runner proof cannot read logarchive contents")
        raw = bounded_bytes(safe_path(export, log["relativePath"]), reader.MAX_PROOF_FILE)
        total += len(raw)
        require(total <= reader.MAX_PROOF_BYTES and len(raw) == log["bytes"]
                and hashlib.sha256(raw).hexdigest() == log["sha256"], "runner proof hash/byte mismatch")
        text = raw.decode("utf-8-sig")
        require(reader.SESSION in text and reader.UDID in text, "runner session content proof absent")
        if hasattr(reader, "RUNNER_LOG_SHA256"):
            require(log["sha256"] == reader.RUNNER_LOG_SHA256 and len(raw) == reader.RUNNER_LOG_BYTES,
                    "fixed Native runner content proof mismatch")
    commands = [c for c in manifest["commands"] if c.get("argv", [])[:2] == ["/usr/bin/log", "show"]]
    require(len(commands) == 1, "original archive query proof absent or ambiguous")
    query = commands[0]
    require(query.get("argv") == reader.log_show_argv(archive) and query.get("exitCode") == 0
            and query.get("timedOut") is False and query.get("outputTruncated") is False,
            "original query failed, changed or incomplete")
    raw = bounded_bytes(safe_path(private, "command-output/log-show.stdout"), reader.LOG_STDOUT_BYTES)
    require(len(raw) == query["stdout"]["bytes"] and hashlib.sha256(raw).hexdigest() == query["stdout"]["rawSha256"],
            "original raw query proof mismatch")
    events = reader.verified_events(raw, archive)
    actors = {(PurePosixPath(e["processImagePath"]).name, e["processID"], e["processImagePath"]) for e in events}
    require(actors, "original actor scope absent")
    return export, actors, manifest


def report_time(value):
    require(isinstance(value, str), "report timestamp absent")
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\s*(?:Z|\+0000|\+00:00)", value)
    require(match, "report timestamp not explicitly UTC or unsupported")
    fraction = match[3] or ""
    return datetime.fromisoformat(match[1] + "T" + match[2] + ("." + fraction if fraction else "") + "+00:00"), len(fraction)


def validate_report(name, pid, path, dates, frames, actors, start, end):
    require(isinstance(name, str) and type(pid) is int and pid > 0, "report process identity absent")
    matches = [a for a in actors if a[0] == name and a[1] == pid and (path is None or a[2] == path)]
    require(len(matches) == 1, "report actor foreign or ambiguous in original scope")
    require(dates and frames > 0, "report timestamp or actual stack frames absent")
    stamps = [report_time(value) for value in dates]
    require(all(start <= stamp < end for stamp, _ in stamps), "report outside original window")
    precision = min(p for _, p in stamps)
    scale = 10 ** (6 - precision)
    rounded = [stamp.replace(microsecond=(stamp.microsecond // scale) * scale) for stamp, _ in stamps]
    require(len(set(rounded)) == 1, "report timestamps conflict")
    return dict(process=name,processID=pid,processImagePath=matches[0][2],timestampUtc=max(s for s, _ in stamps).isoformat(),frames=frames)


def parse_report(raw, suffix, actors, start, end):
    text = raw.decode("utf-8-sig")
    require(all(ord(c) >= 32 or c in "\t\r\n" for c in text), "binary/control report content")
    if suffix == ".ips":
        decoder = json.JSONDecoder()
        values, offset = [], 0
        while offset < len(text):
            while offset < len(text) and text[offset].isspace():
                offset += 1
            if offset == len(text):
                break
            value, offset = decoder.raw_decode(text, offset)
            values.append(value)
            require(len(values) <= 2 and isinstance(value, dict), "unknown ips envelope")
        require(values and (len(values) == 1 or "threads" not in values[0]), "ambiguous ips reports")
        body = values[-1]
        names = [v[k] for v in values for k in ("app_name", "procName") if k in v]
        pids = [v["pid"] for v in values if "pid" in v]
        require(names and pids and len(set(names)) == 1 and len(set(pids)) == 1, "ips process identity conflicts")
        dates = [v[k] for v in values for k in ("timestamp", "captureTime") if k in v]
        threads = body.get("threads")
        require(isinstance(threads, list), "ips threads absent")
        frames = sum(1 for t in threads if isinstance(t, dict) for f in t.get("frames", []) if isinstance(f, dict)
                     and ((isinstance(f.get("symbol"), str) and bool(f["symbol"].strip()))
                          or (type(f.get("imageOffset")) is int and f["imageOffset"] >= 0
                              and type(f.get("imageIndex")) is int and f["imageIndex"] >= 0)))
        paths = [v["procPath"] for v in values if "procPath" in v]
        require(not paths or (all(isinstance(p, str) for p in paths) and len(set(paths)) == 1), "ips process paths conflict")
        result = validate_report(names[0], pids[0], paths[0] if paths else None, dates, frames, actors, start, end)
    else:
        processes = re.findall(r"(?m)^Process:\s+(.+?)\s+\[(\d+)\]\s*$", text)
        dates = re.findall(r"(?m)^Date/Time:\s+(.+?)\s*$", text)
        paths = re.findall(r"(?m)^Path:\s+(.+?)\s*$", text)
        require(len(processes) == 1 and len(dates) == 1 and len(paths) <= 1, "text report identity absent or mixed")
        frames, in_thread = 0, False
        for line in text.splitlines():
            if re.match(r"\s*(?:\d+\s+)?Thread(?:\s+|_)(?:0x)?[0-9a-fA-F]+\b", line):
                in_thread = True
                continue
            if line.startswith("Binary Images:"):
                in_thread = False
            if in_thread and (re.match(r"\s*\d+\s+\S+\s+0x[0-9a-fA-F]+\b", line)
                              or re.match(r"\s+\d+\s+.+\[0x[0-9a-fA-F]+\]", line)):
                frames += 1
        result = validate_report(processes[0][0], int(processes[0][1]), paths[0] if paths else None,
                                 dates, frames, actors, start, end)
    result["format"] = "public-ips-json" if suffix == ".ips" else "single-process-text-stack"
    return result


def candidate(path):
    return path.suffix.lower() in (".ips", ".crash", ".hang", ".spindump", ".sample") or bool(
        re.search(r"(?:^|[-_. ])(?:sample|spindump)(?:[-_. ]|$)", path.name, re.I))


def inspect(scenario, private_root, report_root, environment):
    reader = load_reader(scenario)
    report_root = Path(report_root).absolute()
    require(report_root.is_dir() and not report_root.is_symlink(), "report root absent or symlinked")
    output = report_root / "diagnostic-stacks"
    require(not output.exists(), "stack inventory output already exists")
    output.mkdir()
    manifest = dict(label="READ_ONLY_ORIGINAL_STACK_INVENTORY",scenario=scenario,status="UNAVAILABLE",
                    sourceRunId=reader.ORIGINAL.RUN_ID,sourceArtifactId=reader.ORIGINAL.ARTIFACT_ID,
                    originalSource=reader.ORIGINAL.SOURCE_SHA,newAppOrXCTestRun=False,releaseAcceptance=False,
                    causeDetermined=False,readinessAccepted=False,originalTestPassed=False,
                    stackEvidenceAvailable=False,stacksProvenAbsent=False,inventoryComplete=False,
                    inventory=[],excludedLogarchives=[],matches=[],caps=dict(files=MAX_FILES,entries=MAX_ENTRIES,fileBytes=MAX_FILE_BYTES,totalBytes=MAX_TOTAL_BYTES))
    try:
        export, actors, original = bind_original(reader, private_root, report_root, environment)
        manifest.update(originalSession=reader.SESSION,windowStartUtc=reader.START_UTC,windowEndUtc=reader.END_UTC,
                        archive=original["archive"],actorScope=[dict(name=n,pid=p,imagePath=i)for n,p,i in sorted(actors)])
        start = datetime.strptime(reader.START_UTC, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        end = datetime.strptime(reader.END_UTC, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        total, entries, capped = 0, 0, False
        for current, dirs, files in os.walk(export, followlinks=False):
            dirs.sort()
            entries += len(dirs) + len(files)
            require(entries <= MAX_ENTRIES, "diagnostics directory-entry cap")
            for name in dirs + files:
                require(not (Path(current) / name).is_symlink(), "symlink in exported diagnostics")
            excluded = [name for name in dirs if name.lower().endswith(".logarchive")]
            manifest["excludedLogarchives"].extend((Path(current)/name).relative_to(export).as_posix() for name in excluded)
            dirs[:] = [name for name in dirs if name not in excluded]
            for name in sorted(files):
                path = Path(current) / name
                relative = path.relative_to(export).as_posix()
                if name.lower().endswith(".logarchive"):
                    manifest["excludedLogarchives"].append(relative)
                    continue
                safe_path(export, relative)
                require(len(manifest["inventory"]) < MAX_FILES, "diagnostics file-count cap")
                size = path.stat().st_size
                row = dict(relativePath=relative,bytes=size,sha256=None,candidate=candidate(path))
                manifest["inventory"].append(row)
                if size > MAX_FILE_BYTES or total + size > MAX_TOTAL_BYTES:
                    row["result"] = "UNAVAILABLE_BYTE_CAP"
                    capped = True
                    continue
                raw = bounded_bytes(path, MAX_FILE_BYTES)
                total += len(raw)
                row["sha256"] = hashlib.sha256(raw).hexdigest()
                if not row["candidate"]:
                    row["result"] = "NOT_SUPPORTED_STACK_FILENAME"
                    continue
                try:
                    parsed = parse_report(raw, path.suffix.lower(), actors, start, end)
                except (ValueError, TypeError, KeyError, RecursionError) as error:
                    row.update(result="UNAVAILABLE_FORMAT_OR_SCOPE",reason=str(error)[:200])
                    continue
                target = output / ("stack-" + str(len(manifest["matches"]) + 1).zfill(4) + ".txt")
                target.write_bytes(raw)
                redaction = reader.ORIGINAL.sanitize_output_file(target)
                require(redaction["textSanitized"], "matching stack text could not be sanitized")
                row.update(result="VALIDATED_MATCH",**parsed)
                manifest["matches"].append(dict(sourceRelativePath=relative,publishedFile=target.name,**parsed,**redaction))
        require(not capped, "diagnostics inventory byte cap; see incomplete inventory")
        manifest.update(status="MATCHING_STACK_TEXT" if manifest["matches"] else "NO_VALIDATED_STACKS",
                        inventoryComplete=True,inventoryBytes=total,stackEvidenceAvailable=bool(manifest["matches"]))
    except (ValueError, OSError, KeyError, TypeError, reader.InspectionError, reader.ORIGINAL.EvidenceError) as error:
        manifest.update(status="UNAVAILABLE_OR_INCOMPLETE",inventoryComplete=False,failureReason=str(error)[:200])
        raise StackError("original diagnostic stack inventory unavailable") from error
    finally:
        reader.ORIGINAL.write_json(output / "manifest.json", manifest)
    return manifest


def main(argv):
    require(len(argv) == 5 and argv[1] == "inspect", "usage: inspect auth79|native503 PRIVATE_ROOT REPORT_ROOT")
    inspect(argv[2], argv[3], argv[4], os.environ)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print("ORIGINAL_STACK_INVENTORY_UNAVAILABLE: " + str(error), file=sys.stderr)
        sys.exit(1)
