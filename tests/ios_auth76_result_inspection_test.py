"""Synthetic controls for read-only Auth76 result inspection."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get("AUTH76_INSPECT_DRIVER", ROOT / "scripts/qa/native-auth-session/inspect-original-xcresult.py"))
SPEC = importlib.util.spec_from_file_location("auth76_result", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def metadata():
    repo = {"id": MODULE.REPO_ID, "full_name": MODULE.REPO, "fork": False}
    run = {
        "id": MODULE.RUN_ID, "repository": copy.deepcopy(repo), "head_repository": copy.deepcopy(repo),
        "head_sha": MODULE.SOURCE_SHA, "head_branch": MODULE.SOURCE_BRANCH,
        "path": MODULE.SOURCE_WORKFLOW, "event": "pull_request",
        "run_attempt": 1, "status": "completed", "conclusion": "failure",
    }
    job = {
        "id": MODULE.JOB_ID, "run_id": MODULE.RUN_ID, "run_attempt": 1,
        "head_sha": MODULE.SOURCE_SHA, "head_branch": MODULE.SOURCE_BRANCH,
        "name": "native", "status": "completed", "conclusion": "failure",
    }
    artifact = {
        "id": MODULE.ARTIFACT_ID, "name": MODULE.ARTIFACT_NAME,
        "size_in_bytes": MODULE.ZIP_BYTES, "expired": False,
        "digest": "sha256:" + MODULE.ZIP_SHA256,
        "workflow_run": {
            "id": MODULE.RUN_ID, "repository_id": MODULE.REPO_ID,
            "head_repository_id": MODULE.REPO_ID,
            "head_branch": MODULE.SOURCE_BRANCH, "head_sha": MODULE.SOURCE_SHA,
        },
    }
    return {
        "repo": repo, "run": run, "job": job,
        "attempt_jobs": {"total_count": 1, "jobs": [copy.deepcopy(job)]},
        "artifact": artifact,
        "run_artifacts": {"total_count": 1, "artifacts": [copy.deepcopy(artifact)]},
    }


class EvidenceControls(unittest.TestCase):
    def test_exact_original_identity_and_failure_are_required(self):
        self.assertTrue(MODULE.validate_metadata(metadata())["metadataValidated"])
        mutations = (
            ("repo", "fork", True),
            ("repo", "id", 5),
            ("run", "head_sha", "0" * 40),
            ("run", "head_branch", "unrelated"),
            ("run", "event", "workflow_dispatch"),
            ("run", "path", "different.yml"),
            ("run", "run_attempt", 2),
            ("run", "conclusion", "success"),
            ("job", "conclusion", "success"),
            ("job", "run_attempt", 2),
            ("artifact", "id", 7),
            ("artifact", "digest", "sha256:" + "0" * 64),
            ("artifact", "size_in_bytes", 1),
            ("artifact", "expired", True),
        )
        for section, key, value in mutations:
            with self.subTest(section=section, key=key):
                item = copy.deepcopy(metadata())
                item[section][key] = value
                with self.assertRaises(MODULE.EvidenceError):
                    MODULE.validate_metadata(item)

    def test_independent_attempt_membership_and_nonfork_source(self):
        for mutate in (
            lambda x: x["run"]["head_repository"].update(fork=True),
            lambda x: x["attempt_jobs"]["jobs"].clear(),
            lambda x: x["run_artifacts"]["artifacts"].clear(),
            lambda x: x["artifact"]["workflow_run"].update(head_sha="0" * 40),
        ):
            item = copy.deepcopy(metadata())
            mutate(item)
            with self.assertRaises(MODULE.EvidenceError):
                MODULE.validate_metadata(item)

    def test_original_run_and_both_job_receipts_reject_source_substitutions(self):
        changes = (
            ("run_repository_fork", lambda data: data["run"]["repository"].update(fork=True)),
            ("run_repository_name", lambda data: data["run"]["repository"].update(full_name="other/repo")),
            ("job_source_sha", lambda data: data["job"].update(head_sha="0" * 40)),
            ("job_run_id", lambda data: data["job"].update(run_id=7)),
            ("job_status", lambda data: data["job"].update(status="queued")),
            ("attempt_job_source_sha", lambda data: data["attempt_jobs"]["jobs"][0].update(head_sha="0" * 40)),
            ("attempt_job_run_id", lambda data: data["attempt_jobs"]["jobs"][0].update(run_id=7)),
            ("attempt_job_status", lambda data: data["attempt_jobs"]["jobs"][0].update(status="queued")),
            ("attempt_job_name", lambda data: data["attempt_jobs"]["jobs"][0].update(name="other")),
            ("attempt_job_conclusion", lambda data: data["attempt_jobs"]["jobs"][0].update(conclusion="success")),
            ("attempt_job_branch", lambda data: data["attempt_jobs"]["jobs"][0].update(head_branch="other")),
        )
        self.assertTrue(MODULE.validate_metadata(metadata())["metadataValidated"])
        for label, mutate in changes:
            with self.subTest(label=label):
                item = metadata()
                mutate(item)
                with self.assertRaises(MODULE.EvidenceError):
                    MODULE.validate_metadata(item)
    def make_zip(self, path, entries):
        with zipfile.ZipFile(path, "w") as archive:
            for name, content, mode in entries:
                info = zipfile.ZipInfo(name)
                info.external_attr = mode << 16
                archive.writestr(info, content)

    def test_safe_bundle_extraction_and_unsafe_member_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            good = base / "good.zip"
            self.make_zip(good, [
                ("build.log", b"outside bundle", stat.S_IFREG | 0o644),
                ("result.xcresult/Info.plist", b"synthetic", stat.S_IFREG | 0o644),
            ])
            result = MODULE.safe_extract_result(good, base / "out")
            self.assertEqual(result["resultMembers"], 1)
            self.assertEqual((base / "out/result.xcresult/Info.plist").read_bytes(), b"synthetic")
            self.assertFalse((base / "out/build.log").exists())
            with self.assertRaises(MODULE.EvidenceError):
                MODULE.safe_extract_result(good, base / "out")
            for bad_name in ("../escape", "/absolute", "C:/drive", "result.xcresult/../escape"):
                with self.subTest(bad_name=bad_name):
                    bad = base / "bad.zip"
                    self.make_zip(bad, [
                        ("result.xcresult/Info.plist", b"synthetic", stat.S_IFREG | 0o644),
                        (bad_name, b"bad", stat.S_IFREG | 0o644),
                    ])
                    with zipfile.ZipFile(bad) as archive, self.assertRaises(MODULE.EvidenceError):
                        MODULE.safe_members(archive)
            backslash = zipfile.ZipInfo("safe")
            backslash.filename = "result.xcresult\\Info.plist"
            fake = type("FakeArchive", (), {"infolist": lambda self: [backslash]})()
            with self.assertRaises(MODULE.EvidenceError):
                MODULE.safe_members(fake)
            link = base / "link.zip"
            self.make_zip(link, [
                ("result.xcresult/Info.plist", b"synthetic", stat.S_IFREG | 0o644),
                ("result.xcresult/link", b"target", stat.S_IFLNK | 0o777),
            ])
            with zipfile.ZipFile(link) as archive, self.assertRaises(MODULE.EvidenceError):
                MODULE.safe_members(archive)
            duplicate = base / "duplicate.zip"
            self.make_zip(duplicate, [
                ("result.xcresult/Info.plist", b"one", stat.S_IFREG | 0o644),
                ("result.xcresult/info.plist", b"two", stat.S_IFREG | 0o644),
            ])
            with zipfile.ZipFile(duplicate) as archive, self.assertRaises(MODULE.EvidenceError):
                MODULE.safe_members(archive)

    def test_failed_extraction_keeps_partial_original_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            archive = base / "partial.zip"
            destination = base / "extracted"
            self.make_zip(archive, [
                ("result.xcresult/Info.plist", b"synthetic-info", stat.S_IFREG | 0o644),
                ("result.xcresult/Data/second", b"synthetic-data", stat.S_IFREG | 0o644),
            ])
            original_copy = MODULE.shutil.copyfileobj
            copies = 0

            def fail_second(source, sink, length):
                nonlocal copies
                copies += 1
                if copies == 2:
                    raise OSError("synthetic second-entry failure")
                return original_copy(source, sink, length)

            with patch.object(MODULE.shutil, "copyfileobj", side_effect=fail_second):
                with self.assertRaisesRegex(OSError, "synthetic second-entry failure"):
                    MODULE.safe_extract_result(archive, destination)
            self.assertEqual(copies, 2)
            self.assertEqual((destination / "result.xcresult/Info.plist").read_bytes(), b"synthetic-info")
    def test_archive_bytes_and_sha_gate_precede_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tiny.zip"
            self.make_zip(path, [("result.xcresult/Info.plist", b"x", stat.S_IFREG | 0o644)])
            with self.assertRaisesRegex(MODULE.EvidenceError, "byte count"):
                MODULE.validate_archive(path)
            with patch.object(MODULE, "ZIP_BYTES", path.stat().st_size), patch.object(MODULE, "ZIP_SHA256", hashlib.sha256(path.read_bytes()).hexdigest()):
                self.assertTrue(MODULE.validate_archive(path)["archiveValidated"])
                changed = bytearray(path.read_bytes())
                changed[10] ^= 1
                path.write_bytes(changed)
                with self.assertRaisesRegex(MODULE.EvidenceError, "sha256"):
                    MODULE.validate_archive(path)
            self.assertFalse((Path(temp) / "extracted").exists())

    def test_xcresulttool_command_receives_no_token_and_published_text_is_redacted(self):
        with tempfile.TemporaryDirectory() as temp:
            seen = []

            def fake_run(command, **options):
                seen.append((command, options["env"]))
                options["stdout"].write(b'callback https://example.test/cb?code=synthetic Bearer secret ghp_example')
                return type("Result", (), {"returncode": 0})()

            with patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                record = MODULE.capture_command("summary", ["get", "test-results", "summary", "--path", "/synthetic/result.xcresult"], temp)
            self.assertEqual(record["exitCode"], 0)
            self.assertEqual(seen[0][0][:2], ["xcrun", "xcresulttool"])
            self.assertNotIn("GH_TOKEN", seen[0][1])
            published = (Path(temp) / "summary.stdout").read_text()
            self.assertNotIn("https://", published)
            self.assertNotIn("ghp_example", published)
            self.assertNotIn("Bearer secret", published)
            self.assertIn("[REDACTED_URL]", published)
            self.assertNotEqual(record["stdoutEvidence"]["rawSha256"], record["stdoutEvidence"]["publishedSha256"])
    def test_workflow_is_first_push_read_only_and_preview_disabled(self):
        workflow = (ROOT / ".github/workflows/ios-auth76-result-inspection-20261107.yml").read_text()
        vercel = json.loads((ROOT / "vercel.json").read_text())
        self.assertFalse(vercel["git"]["deploymentEnabled"]["codex/ios-auth76-result-inspection-20261107"])
        for text in ("github.event.created == true", "github.run_attempt == 1", "github.run_number == 1",
                     "contents: read", "actions: read", "macos-26-intel", "Xcode_26.6.app",
                     "READ_ONLY_ORIGINAL_EVIDENCE", "13584775403/zip", "verify-metadata", "verify-extract"):
            self.assertIn(text, workflow)
        for forbidden in ("workflow_dispatch:", "pull_request:", "contents: write", "actions: write",
                          "xcodebuild ", "simctl ", "npm ci", "native:prepare", "curl "):
            self.assertNotIn(forbidden, workflow)
        self.assertEqual(workflow.count("gh api --method GET"), 2)


if __name__ == "__main__":
    unittest.main()
