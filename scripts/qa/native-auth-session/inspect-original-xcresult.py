#!/usr/bin/env python3
"""Read-only inspection of the immutable Auth76 result artifact."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import zipfile

REPO = "yarinn12/sogrim-hashbon"
REPO_ID = 1247836328
RUN_ID = 42396343370
JOB_ID = 128474426526
ARTIFACT_ID = 13584775403
ARTIFACT_NAME = "native-auth-session-custom"
SOURCE_SHA = "ff7411ad0ac1b01f92f09fe05bf9a301fd541fc1"
SOURCE_BRANCH = "codex/test-release-459-20261104"
SOURCE_WORKFLOW = ".github/workflows/ios-auth-return-qa.yml"
ZIP_BYTES = 67123244
ZIP_SHA256 = "f53425ba8406a6742ed315e9e5c5871246f84af0dacd5cd671085c46f43b039b"
MAX_UNCOMPRESSED = 200_000_000
MAX_ENTRY = 100_000_000
MAX_MEMBERS = 3000


class EvidenceError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise EvidenceError(message)


def read_json(path):
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def validate_metadata(data):
    repo = data["repo"]
    run = data["run"]
    job = data["job"]
    attempt_jobs = data["attempt_jobs"]
    artifact = data["artifact"]
    run_artifacts = data["run_artifacts"]
    require(repo.get("id") == REPO_ID and repo.get("full_name") == REPO and repo.get("fork") is False, "repository identity or fork status")
    require(run.get("id") == RUN_ID and run.get("repository", {}).get("id") == REPO_ID, "run/repository identity")
    head = run.get("head_repository") or {}
    require(head.get("id") == REPO_ID and head.get("full_name") == REPO and head.get("fork") is False, "source head repository is not the original nonfork")
    for key, expected in (
        ("head_sha", SOURCE_SHA), ("head_branch", SOURCE_BRANCH),
        ("path", SOURCE_WORKFLOW), ("event", "pull_request"),
        ("run_attempt", 1), ("status", "completed"), ("conclusion", "failure"),
    ):
        require(run.get(key) == expected, "run " + key)
    require(job.get("id") == JOB_ID and job.get("run_id") == RUN_ID and job.get("run_attempt") == 1, "job/run/attempt identity")
    require(job.get("name") == "native" and job.get("status") == "completed" and job.get("conclusion") == "failure", "original native job failure")
    jobs = attempt_jobs.get("jobs")
    require(isinstance(jobs, list) and attempt_jobs.get("total_count") == len(jobs), "attempt jobs list incomplete")
    require(len([item for item in jobs if item.get("id") == JOB_ID and item.get("run_attempt") == 1 and item.get("conclusion") == "failure"]) == 1, "original failed job missing from attempt 1")
    require(artifact.get("id") == ARTIFACT_ID and artifact.get("name") == ARTIFACT_NAME and artifact.get("size_in_bytes") == ZIP_BYTES, "artifact identity/size")
    require(artifact.get("expired") is False and artifact.get("digest") == "sha256:" + ZIP_SHA256, "artifact expired or digest mismatch")
    link = artifact.get("workflow_run") or {}
    for key, expected in (
        ("id", RUN_ID), ("repository_id", REPO_ID), ("head_repository_id", REPO_ID),
        ("head_branch", SOURCE_BRANCH), ("head_sha", SOURCE_SHA),
    ):
        require(link.get(key) == expected, "artifact workflow_run " + key)
    items = run_artifacts.get("artifacts")
    require(isinstance(items, list) and run_artifacts.get("total_count") == len(items), "run artifacts list incomplete")
    require(len([item for item in items if item.get("id") == ARTIFACT_ID and item.get("digest") == "sha256:" + ZIP_SHA256]) == 1, "artifact missing from original run")
    return {
        "label": "READ_ONLY_ORIGINAL_EVIDENCE",
        "releaseAcceptance": False,
        "repository": REPO,
        "sourceRunId": RUN_ID,
        "sourceAttempt": 1,
        "sourceJobId": JOB_ID,
        "sourceArtifactId": ARTIFACT_ID,
        "sourceCommit": SOURCE_SHA,
        "sourceWorkflow": SOURCE_WORKFLOW,
        "sourceConclusion": "failure",
        "artifactSha256": ZIP_SHA256,
        "artifactBytes": ZIP_BYTES,
        "metadataValidated": True,
    }


def validate_archive(path):
    path = Path(path)
    require(path.is_file() and path.stat().st_size == ZIP_BYTES, "archive byte count")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    require(digest.hexdigest() == ZIP_SHA256, "archive sha256")
    return {"archiveBytes": ZIP_BYTES, "archiveSha256": ZIP_SHA256, "archiveValidated": True}


def safe_members(archive):
    members = archive.infolist()
    require(0 < len(members) <= MAX_MEMBERS, "archive member count")
    seen = set()
    total = 0
    result_count = 0
    for info in members:
        name = info.filename
        parts = name.rstrip("/").split("/")
        require(name and not name.startswith("/") and "\\" not in name and "\0" not in name, "unsafe ZIP member name")
        require(all(part not in ("", ".", "..") for part in parts) and not re.match(r"^[A-Za-z]:", name), "ZIP traversal or drive path")
        folded = "/".join(parts).casefold()
        require(folded not in seen, "duplicate ZIP member path")
        seen.add(folded)
        mode = info.external_attr >> 16
        file_type = stat.S_IFMT(mode)
        require(file_type in (0, stat.S_IFREG, stat.S_IFDIR), "ZIP special file or symlink")
        require(info.file_size <= MAX_ENTRY, "ZIP member too large")
        total += info.file_size
        require(total <= MAX_UNCOMPRESSED, "ZIP uncompressed total too large")
        if parts[0] == "result.xcresult":
            require(len(parts) > 1 or info.is_dir(), "result bundle root is not a directory")
            result_count += 1
    require(result_count > 0, "result.xcresult absent")
    return members, total, result_count


def safe_extract_result(archive_path, destination):
    destination = Path(destination)
    require(not destination.exists(), "extraction destination already exists")
    with zipfile.ZipFile(archive_path) as archive:
        members, total, result_count = safe_members(archive)
        destination.mkdir(parents=True)
        try:
            for info in members:
                parts = info.filename.rstrip("/").split("/")
                if parts[0] != "result.xcresult":
                    continue
                target = destination.joinpath(*parts)
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, target.open("xb") as sink:
                    shutil.copyfileobj(source, sink, length=1024 * 1024)
        except Exception:
            shutil.rmtree(destination)
            raise
    require((destination / "result.xcresult" / "Info.plist").is_file(), "extracted result bundle Info.plist absent")
    return {"zipMembers": len(members), "zipUncompressedBytes": total, "resultMembers": result_count, "safeExtraction": True}


def sanitize_output_file(path):
    """Keep a hash of original bytes while excluding URLs and tokens from published text."""
    path = Path(path)
    if not path.is_file():
        return None
    original = path.read_bytes()
    raw_hash = hashlib.sha256(original).hexdigest()
    try:
        content = original.decode("utf-8")
    except UnicodeDecodeError:
        return {"rawSha256": raw_hash, "publishedSha256": raw_hash, "textSanitized": False}
    if "\0" in content:
        return {"rawSha256": raw_hash, "publishedSha256": raw_hash, "textSanitized": False}
    content = re.sub(r"https?:[^\s\"<>]+", "[REDACTED_URL]", content, flags=re.IGNORECASE)
    content = re.sub(r"(?i)\bBearer\s+\S+", "Bearer [REDACTED]", content)
    content = re.sub(r"(?i)\b(?:gh[opsru]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)", "[REDACTED_TOKEN]", content)
    content = re.sub(r"(?i)\b(code|state|access_token|id_token|refresh_token|client_secret|token)=[^&\s\"<>]+", r"\1=[REDACTED]", content)
    published = content.encode("utf-8")
    if published != original:
        path.write_bytes(published)
    return {
        "rawSha256": raw_hash,
        "publishedSha256": hashlib.sha256(published).hexdigest(),
        "textSanitized": True,
    }

def capture_command(label, arguments, output_dir, export_dir=None):
    output_dir = Path(output_dir)
    stdout_path = output_dir / (label + ".stdout")
    stderr_path = output_dir / (label + ".stderr")
    command = ["xcrun", "xcresulttool", *arguments]
    started = time.monotonic()
    status = None
    with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
        try:
            result = subprocess.run(command, stdout=stdout, stderr=stderr, check=False, timeout=120, env={
                "PATH": os.environ.get("PATH", ""),
                "DEVELOPER_DIR": os.environ.get("DEVELOPER_DIR", ""),
                "HOME": os.environ.get("HOME", ""),
                "TMPDIR": os.environ.get("TMPDIR", "/tmp"),
            })
            status = result.returncode
        except subprocess.TimeoutExpired:
            status = "timeout"
        except OSError:
            status = "unavailable"
    exported_files = []
    if export_dir and Path(export_dir).is_dir():
        for item in sorted(Path(export_dir).rglob("*")):
            if item.is_file() and not item.is_symlink():
                exported_files.append({
                    "path": str(item.relative_to(export_dir)),
                    "bytes": item.stat().st_size,
                    **sanitize_output_file(item),
                })
    return {
        "label": label,
        "arguments": ["xcrun", "xcresulttool", *[str(item) for item in arguments]],
        "exitCode": status,
        "durationMs": round((time.monotonic() - started) * 1000),
        "stdout": stdout_path.name,
        "stdoutEvidence": sanitize_output_file(stdout_path),
        "stderr": stderr_path.name,
        "stderrEvidence": sanitize_output_file(stderr_path),
        "exportDirectory": Path(export_dir).name if export_dir else None,
        "exportedFiles": exported_files,
    }


def inspect_result(result_path, output_dir):
    result_path = Path(result_path).resolve()
    output_dir = Path(output_dir)
    require((result_path / "Info.plist").is_file(), "result bundle missing")
    output_dir.mkdir(parents=True, exist_ok=True)
    commands = [
        ("version", ["--version"], None),
        ("help", ["help"], None),
        ("help-summary", ["help", "get", "test-results", "summary"], None),
        ("help-tests", ["help", "get", "test-results", "tests"], None),
        ("help-object", ["help", "get", "object"], None),
        ("help-diagnostics", ["help", "export", "diagnostics"], None),
        ("help-attachments", ["help", "export", "attachments"], None),
        ("content-availability", ["get", "content-availability", "--path", str(result_path)], None),
        ("summary", ["get", "test-results", "summary", "--path", str(result_path)], None),
        ("tests", ["get", "test-results", "tests", "--path", str(result_path)], None),
        ("object", ["get", "object", "--legacy", "--format", "json", "--path", str(result_path)], None),
    ]
    for label in ("diagnostics", "attachments"):
        export_dir = output_dir / ("export-" + label)
        commands.append(("export-" + label, ["export", label, "--path", str(result_path), "--output-path", str(export_dir)], export_dir))
    records = [capture_command(label, args, output_dir, export_dir) for label, args, export_dir in commands]
    manifest = {
        "label": "READ_ONLY_ORIGINAL_EVIDENCE",
        "releaseAcceptance": False,
        "originalResultOnly": True,
        "commands": records,
        "unavailableOrFailed": [record["label"] for record in records if record["exitCode"] != 0],
    }
    write_json(output_dir / "xcresulttool-manifest.json", manifest)
    return manifest


def main(argv):
    require(len(argv) >= 2, "command required")
    command = argv[1]
    if command == "verify-metadata":
        require(len(argv) == 4, "verify-metadata METADATA_DIR MANIFEST")
        data = {name: read_json(Path(argv[2]) / (name + ".json")) for name in ("repo", "run", "job", "attempt_jobs", "artifact", "run_artifacts")}
        write_json(argv[3], validate_metadata(data))
    elif command == "verify-extract":
        require(len(argv) == 5, "verify-extract ZIP DESTINATION MANIFEST")
        result = validate_archive(argv[2])
        result.update(safe_extract_result(argv[2], argv[3]))
        result.update({"label": "READ_ONLY_ORIGINAL_EVIDENCE", "releaseAcceptance": False})
        write_json(argv[4], result)
    elif command == "inspect":
        require(len(argv) == 4, "inspect RESULT_BUNDLE OUTPUT_DIR")
        inspect_result(argv[2], argv[3])
    else:
        raise EvidenceError("unknown command")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (EvidenceError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print("EVIDENCE_REJECTED: " + str(error), file=sys.stderr)
        sys.exit(1)
