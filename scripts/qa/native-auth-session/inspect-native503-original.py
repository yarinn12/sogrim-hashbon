#!/usr/bin/env python3
"""Fixed Native503 metadata and default-result ZIP layout adapter.

Private generic readers remain unchanged. Native503 stores its only selected
result under default/, unlike the original Auth artifact's top-level result.
"""
import importlib.util
from pathlib import Path
import shutil
import sys
import zipfile

SPEC = importlib.util.spec_from_file_location(
    "native503_original_base", Path(__file__).with_name("inspect-original-xcresult.py"))
ORIGINAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORIGINAL)
IDENTITY = dict(RUN_ID=42422409530,JOB_ID=128554012283,ARTIFACT_ID=13595380002,
                ARTIFACT_NAME="ios-capacitor-parity-b19b57ec071ab0fbd3cd799b217198ccfd013a75",
                SOURCE_SHA="b19b57ec071ab0fbd3cd799b217198ccfd013a75",
                SOURCE_WORKFLOW=".github/workflows/qa.yml",ZIP_BYTES=113053740,
                ZIP_SHA256="4d7b002dbb46dc0afd08086012b4472d43a311a79abf4eb052045765c30c9b93")
for key, value in IDENTITY.items():
    setattr(ORIGINAL, key, value)
SOURCE_TREE = "a54f15852c16ad7b9c2b04b8d632b93599d0419f"
JOB_NAME = "ios-native / native-parity"
ATTEMPT_JOB_COUNT = 68
RESULT_PREFIX = ("default", "result.xcresult")
EvidenceError = ORIGINAL.EvidenceError
RAW_METADATA = ORIGINAL.validate_metadata
RAW_MEMBERS = ORIGINAL.safe_members


def __getattr__(name):
    return getattr(ORIGINAL, name)


def require_original_job(item, label):
    for key, expected in (("id", ORIGINAL.JOB_ID), ("run_id", ORIGINAL.RUN_ID), ("run_attempt", 1),
                          ("head_sha", ORIGINAL.SOURCE_SHA), ("head_branch", ORIGINAL.SOURCE_BRANCH),
                          ("name", JOB_NAME), ("status", "completed"), ("conclusion", "failure")):
        ORIGINAL.require(isinstance(item, dict) and item.get(key) == expected, label + " " + key)


def validate_metadata(data):
    jobs = data.get("attempt_jobs", {})
    ORIGINAL.require(jobs.get("total_count") == ATTEMPT_JOB_COUNT
                     and isinstance(jobs.get("jobs"), list) and len(jobs["jobs"]) == ATTEMPT_JOB_COUNT,
                     "complete original QA68 attempt job inventory required")
    identifiers = [item.get("id") if isinstance(item, dict) else None for item in jobs["jobs"]]
    ORIGINAL.require(all(type(value) is int and value > 0 for value in identifiers)
                     and len(set(identifiers)) == ATTEMPT_JOB_COUNT, "QA68 job identities missing or duplicated")
    result = RAW_METADATA(data)
    result.update(sourceTree=SOURCE_TREE,sourceJobName=JOB_NAME,
                  originalResultPrefix="default/result.xcresult",newAppOrXCTestRun=False)
    return result


def safe_members(archive):
    # The unchanged generic checker validates every member's path, uniqueness,
    # mode and caps before its final top-level-result assertion. That assertion
    # is the sole expected mismatch for this pinned default/ artifact layout.
    try:
        RAW_MEMBERS(archive)
    except EvidenceError as error:
        if str(error) != "result.xcresult absent":
            raise
    else:
        raise EvidenceError("foreign top-level result bundle")
    members = archive.infolist()
    selected = []
    for info in members:
        parts = tuple(info.filename.rstrip("/").split("/"))
        if "result.xcresult" in parts:
            ORIGINAL.require(parts[:2] == RESULT_PREFIX, "foreign result profile")
            ORIGINAL.require(len(parts) > 2 or info.is_dir(), "default result root is not a directory")
            selected.append(info)
    ORIGINAL.require(selected, "default/result.xcresult absent")
    return members, sum(info.file_size for info in members), len(selected)


def safe_extract_result(archive_path, destination):
    destination = Path(destination)
    ORIGINAL.require(not destination.exists(), "extraction destination already exists")
    with zipfile.ZipFile(archive_path) as archive:
        members, total, count = safe_members(archive)
        destination.mkdir(parents=True)
        for info in members:
            parts = tuple(info.filename.rstrip("/").split("/"))
            if parts[:2] != RESULT_PREFIX:
                continue
            target = destination.joinpath(*parts[1:])
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, target.open("xb") as sink:
                    shutil.copyfileobj(source, sink, length=1024 * 1024)
    ORIGINAL.require((destination / "result.xcresult/Info.plist").is_file(), "default result Info.plist absent")
    return dict(zipMembers=len(members),zipUncompressedBytes=total,resultMembers=count,
                safeExtraction=True,originalResultPrefix="default/result.xcresult",
                extractedResultPath="result.xcresult")


ORIGINAL.require_original_job = require_original_job
ORIGINAL.validate_metadata = validate_metadata
ORIGINAL.safe_extract_result = safe_extract_result


def main(argv):
    ORIGINAL.require(len(argv) >= 2 and argv[1] in ("verify-metadata", "verify-extract"),
                     "only fixed Native503 metadata/archive verification is allowed")
    return ORIGINAL.main(argv)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (EvidenceError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print("NATIVE503_EVIDENCE_REJECTED: " + str(error), file=sys.stderr)
        sys.exit(1)
