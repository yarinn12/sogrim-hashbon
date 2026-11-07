#!/usr/bin/env python3
"""Immutable Auth79 identity adapter for the existing original-evidence reader.

Load a private module instance: Auth76 constants/functions in other imports are
never modified. No caller-supplied run, source, URL or archive hash is accepted.
"""
import importlib.util
from pathlib import Path
import sys
import zipfile

SPEC = importlib.util.spec_from_file_location("auth79_original_xcresult_base", Path(__file__).with_name("inspect-original-xcresult.py"))
ORIGINAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORIGINAL)
IDENTITY = {
    "RUN_ID": 42422409479,
    "JOB_ID": 128553466429,
    "ARTIFACT_ID": 13594830607,
    "SOURCE_SHA": "b19b57ec071ab0fbd3cd799b217198ccfd013a75",
    "ZIP_BYTES": 62833001,
    "ZIP_SHA256": "613af51c8e16ecbd0d662663ed1a77c69eb2e99e1a0e2079a07fee771cb725af",
}
for key, value in IDENTITY.items():
    setattr(ORIGINAL, key, value)
SOURCE_TREE = "a54f15852c16ad7b9c2b04b8d632b93599d0419f"
EvidenceError = ORIGINAL.EvidenceError


def __getattr__(name):
    return getattr(ORIGINAL, name)


def main(argv):
    # The generic inspector's broad inspect mode is deliberately unavailable.
    # Only its existing metadata and safe ZIP verification stages are needed.
    ORIGINAL.require(len(argv) >= 2 and argv[1] in ("verify-metadata", "verify-extract"),
                     "only fixed Auth79 metadata/archive verification is allowed")
    return ORIGINAL.main(argv)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (EvidenceError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print("AUTH79_EVIDENCE_REJECTED: " + str(error), file=sys.stderr)
        sys.exit(1)
