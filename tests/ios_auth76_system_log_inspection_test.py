"""Synthetic controls for the original Auth76 system log archive decoder."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
DRIVER = ROOT / "scripts/qa/native-auth-session/inspect-original-system-log.py"
SPEC = importlib.util.spec_from_file_location("auth76_system_log", DRIVER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture(base, udid=MODULE.UDID, prefix="0_Test_Diagnostics"):
    export = Path(base) / "diagnostics-export"
    archive = export / prefix / "simctl_diagnostics" / udid / "system.logarchive"
    archive.mkdir(parents=True)
    (archive / "logfile.bin").write_bytes(b"synthetic original archive")
    return export, archive


class SystemLogControls(unittest.TestCase):
    def test_exact_original_archive_only(self):
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            export = Path(temp) / "diagnostics-export"
            export.mkdir()
            with self.assertRaisesRegex(MODULE.InspectionError, "exactly one"):
                MODULE.select_archive(export)
            good_export, good = fixture(Path(temp) / "good")
            self.assertEqual(MODULE.select_archive(good_export), good)
            fixture(Path(temp) / "good", prefix="another")
            with self.assertRaisesRegex(MODULE.InspectionError, "exactly one"):
                MODULE.select_archive(good_export)
            wrong_export, _ = fixture(Path(temp) / "wrong", udid="WRONG-DEVICE")
            with self.assertRaisesRegex(MODULE.InspectionError, "UDID"):
                MODULE.select_archive(wrong_export)

    def test_remote_archive_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            export, archive = fixture(Path(temp) / "inside")
            _, outside = fixture(Path(temp) / "outside")
            with self.assertRaisesRegex(MODULE.InspectionError, "outside"):
                MODULE.validate_archive_path(export, outside)
            actual = Path.is_symlink

            def pretend_symlink(path):
                return path == archive or actual(path)

            with patch.object(Path, "is_symlink", pretend_symlink):
                with self.assertRaisesRegex(MODULE.InspectionError, "symlink"):
                    MODULE.select_archive(export)

    def test_original_archive_fingerprint_and_hard_size_limits(self):
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            export, archive = fixture(temp)
            evidence = MODULE.fingerprint_archive(MODULE.select_archive(export))
            self.assertEqual(evidence["files"], 1)
            self.assertEqual(evidence["bytes"], len(b"synthetic original archive"))
            self.assertEqual(len(evidence["treeSha256"]), 64)
            with patch.object(MODULE, "MAX_ARCHIVE_BYTES", 1):
                with self.assertRaisesRegex(MODULE.InspectionError, "size limit"):
                    MODULE.fingerprint_archive(archive)
            (archive / "logfile.bin").unlink()
            with self.assertRaisesRegex(MODULE.InspectionError, "empty"):
                MODULE.fingerprint_archive(archive)

    def test_help_checked_and_query_has_explicit_archive_utc_window_and_six_processes(self):
        help_text = (ROOT / "tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt").read_text(encoding="utf-8")
        self.assertTrue(MODULE.validate_log_help(help_text))
        with self.assertRaisesRegex(MODULE.InspectionError, "lacks --start"):
            MODULE.validate_log_help(help_text.replace("--start <date>", ""))
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            _, archive = fixture(temp)
            argv = MODULE.log_show_argv(archive)
            MODULE.validate_command(argv)
            MODULE.validate_command(["/usr/bin/xcrun", "xcresulttool", "--version"])
            self.assertEqual(argv[:2], ["/usr/bin/log", "show"])
            self.assertEqual(argv[-1], str(archive))
            self.assertNotIn("--archive", argv)
            self.assertIn("--timezone", argv)
            self.assertIn("UTC", argv)
            self.assertEqual(argv[argv.index("--start") + 1], MODULE.START_UTC + "+0000")
            self.assertEqual(argv[argv.index("--end") + 1], MODULE.END_UTC + "+0000")
            self.assertEqual(argv[argv.index("--predicate") + 1], MODULE.PREDICATE)
            for name in MODULE.PROCESSES:
                self.assertIn('process == "' + name + '"', MODULE.PREDICATE)
            self.assertNotIn("--last", argv)

    def test_live_log_and_forbidden_commands_cannot_run(self):
        forbidden = (
            ["/usr/bin/log", "stream"],
            ["/usr/bin/log", "show"],
            ["/usr/bin/log", "show", "--last", "1h"],
            ["/usr/bin/xcrun", "simctl", "list"],
            ["xcrun", "xcresulttool", "--version"],
            ["xcodebuild", "test"],
            ["curl", "https://example.test"],
        )
        for argv in forbidden:
            with self.subTest(argv=argv), self.assertRaises(MODULE.InspectionError):
                MODULE.validate_command(argv)
        with self.assertRaisesRegex(MODULE.InspectionError, "archive"):
            MODULE.log_show_argv(Path("/tmp/not-an-archive"))
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            _, archive = fixture(temp)
            good = MODULE.log_show_argv(archive)
            for changed in (
                good[:-1], good[:-1] + ["/tmp/other/system.logarchive"],
                good[:2] + ["--archive", str(archive)] + good[2:-1],
                good[:good.index(MODULE.START_UTC + "+0000")] + ["2026-11-07 17:50:21+0000"] + good[good.index(MODULE.START_UTC + "+0000") + 1:],
                good[:good.index(MODULE.PREDICATE)] + ['process == "App"'] + good[good.index(MODULE.PREDICATE) + 1:],
            ):
                with self.subTest(changed=changed), self.assertRaises(MODULE.InspectionError):
                    MODULE.validate_command(changed)

    def test_task_temp_ownership_and_nontext_report_rejection(self):
        with tempfile.TemporaryDirectory(prefix="a76-", dir=ROOT) as temp:
            private = Path(temp) / MODULE.PRIVATE_NAME
            private.mkdir()
            self.assertEqual(MODULE.validate_private_root(private, {"RUNNER_TEMP": temp}), private)
            with self.assertRaisesRegex(MODULE.InspectionError, "task-owned"):
                MODULE.validate_private_root(Path(temp), {"RUNNER_TEMP": temp})
            raw = Path(temp) / "raw"
            report = Path(temp) / "report"
            raw.mkdir()
            report.mkdir()
            stdout = raw / "log-show.stdout"
            stderr = raw / "log-show.stderr"
            stdout.write_bytes(b"\0synthetic token")
            stderr.write_bytes(b"")
            _, archive = fixture(Path(temp) / "fixture")
            result = {
                "argv": MODULE.log_show_argv(archive),
                "exitCode": 0,
                "rawPaths": {"stdout": stdout, "stderr": stderr},
                "rawBytes": {"stdout": stdout.stat().st_size, "stderr": 0},
            }
            published = MODULE.publish_result(result, report)
            self.assertTrue(published["stdout"]["withheld"])
            self.assertIsNone(published["stdout"]["file"])
            self.assertEqual(published["stdout"]["bytes"], stdout.stat().st_size)
            self.assertFalse((report / stdout.name).exists())
    def test_clean_child_environment_excludes_tokens_and_network_credentials(self):
        env = MODULE.clean_environment({
            "PATH": "/usr/bin", "HOME": "/private/home", "TMPDIR": "/private/tmp",
            "DEVELOPER_DIR": "/Applications/Xcode_26.6.app/Contents/Developer",
            "GH_TOKEN": "SECRET", "GITHUB_TOKEN": "SECRET", "ACTIONS_RUNTIME_TOKEN": "SECRET",
            "SUPABASE_SERVICE_ROLE_KEY": "SECRET", "NODE_OPTIONS": "--import hidden.mjs",
        })
        self.assertEqual(env["TZ"], "UTC")
        self.assertEqual(env["DEVELOPER_DIR"], "/Applications/Xcode_26.6.app/Contents/Developer")
        self.assertNotIn("SECRET", json.dumps(env))
        self.assertEqual(set(env), {"PATH", "HOME", "TMPDIR", "DEVELOPER_DIR", "TZ", "LANG"})

    def test_empty_failed_timeout_and_capped_output_never_claim_availability(self):
        self.assertEqual(MODULE.output_status(0, b"", False, False), "EMPTY")
        self.assertEqual(MODULE.output_status(0, b" \n", False, False), "EMPTY")
        self.assertEqual(MODULE.output_status(1, b"partial", False, False), "UNAVAILABLE_COMMAND_FAILED")
        self.assertEqual(MODULE.output_status(0, b"partial", True, False), "INCOMPLETE_TIMEOUT")
        self.assertEqual(MODULE.output_status(0, b"partial", False, True), "INCOMPLETE_OUTPUT_CAP")
        self.assertEqual(MODULE.output_status(0, b"[]", False, False), "EMPTY")
        self.assertEqual(MODULE.output_status(0, b"plain text", False, False), "UNPARSEABLE")
        self.assertEqual(MODULE.output_status(0, b'[{"timestamp":"2026-11-07T17:50:28Z","process":"SafariViewService"}]', False, False), "AVAILABLE")
        self.assertLessEqual(MODULE.LOG_SECONDS, 180)
        self.assertLessEqual(MODULE.LOG_STDOUT_BYTES, 30_000_000)

    def test_real_macos_help_stderr_fixture_is_accepted(self):
        fixture = ROOT / "tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt"
        provenance = json.loads((ROOT / "tests/fixtures/auth76/log-help-show-provenance.json").read_text(encoding="utf-8"))
        payload = fixture.read_bytes()
        self.assertEqual(hashlib.sha256(payload).hexdigest(), provenance["publishedSha256"])
        self.assertEqual(provenance["exitCode"], 64)
        self.assertEqual(provenance["stream"], "stderr")
        self.assertTrue(MODULE.validate_log_help(payload.decode("utf-8")))
        result = {"exitCode": 64, "timedOut": False, "outputTruncated": False}
        self.assertTrue(MODULE.validate_log_help_result(result, payload.decode("utf-8")))

    def test_help_64_requires_complete_output_and_query_still_requires_zero(self):
        content = (ROOT / "tests/fixtures/auth76/log-help-show-macos26.6.1.stderr.txt").read_text(encoding="utf-8")
        for exit_code, text, timeout, cap in (
            (64, content.replace("shorthand usage:", ""), False, False),
            (64, content.replace("--predicate <predicate>", ""), False, False),
            (64, content, True, False),
            (64, content, False, True),
            (1, content, False, False),
        ):
            with self.subTest(exit=exit_code, timeout=timeout, cap=cap), self.assertRaises(MODULE.InspectionError):
                MODULE.validate_log_help_result(
                    {"exitCode": exit_code, "timedOut": timeout, "outputTruncated": cap}, text)
        self.assertTrue(MODULE.validate_log_help_result(
            {"exitCode": 0, "timedOut": False, "outputTruncated": False}, content))
        self.assertEqual(MODULE.output_status(64, b'[{"timestamp":"2026-11-07T17:50:28Z"}]', False, False),
                         "UNAVAILABLE_COMMAND_FAILED")
        self.assertEqual(MODULE.output_status(0, b'[{"timestamp":"2026-11-07T17:50:28Z"}]', False, False),
                         "AVAILABLE")

    def test_one_off_workflow_uses_only_original_gets_and_disables_preview(self):
        workflow = (ROOT / ".github/workflows/ios-auth76-system-log-inspection-20261107.yml").read_text()
        vercel = json.loads((ROOT / "vercel.json").read_text())
        self.assertFalse(vercel["git"]["deploymentEnabled"]["codex/ios-auth76-system-log-inspection-20261107"])
        for required in (
            "github.event.created == true", "github.run_attempt == 1", "github.run_number == 1",
            "macos-26-intel", "Xcode_26.6.app", "contents: read", "actions: read",
            "READ_ONLY_ORIGINAL_EVIDENCE", "13584775403/zip", "verify-metadata", "verify-extract",
            "inspect-original-system-log.py",
        ):
            self.assertIn(required, workflow)
        self.assertEqual(workflow.count("gh api --method GET"), 2)
        for forbidden in ("workflow_dispatch:", "pull_request:", "contents: write", "actions: write",
                          "xcodebuild ", "simctl ", "log stream", "curl ", "native:prepare", "npm ci"):
            self.assertNotIn(forbidden, workflow)


    def test_new_help_workflow_is_first_push_read_only_and_preview_disabled(self):
        workflow = (ROOT / ".github/workflows/ios-auth76-system-log-help-20261107.yml").read_text(encoding="utf-8")
        vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
        branch = "codex/ios-auth76-system-log-help-20261107"
        self.assertFalse(vercel["git"]["deploymentEnabled"][branch])
        self.assertEqual(workflow.count(branch), 2)
        self.assertIn("github.event.created == true", workflow)
        self.assertIn("github.run_attempt == 1", workflow)
        self.assertIn("github.run_number == 1", workflow)
        self.assertIn("macos-26-intel", workflow)
        self.assertIn("Xcode_26.6.app", workflow)
        self.assertIn("READ_ONLY_ORIGINAL_EVIDENCE", workflow)
        self.assertIn("13584775403/zip", workflow)
        self.assertIn("verify-metadata", workflow)
        self.assertIn("verify-extract", workflow)
        self.assertIn("inspect-original-system-log.py", workflow)
        self.assertEqual(workflow.count("gh api --method GET"), 2)
        for forbidden in ("workflow_dispatch:", "pull_request:", "contents: write", "actions: write",
                          "xcodebuild ", "simctl ", "log stream", "curl ", "npm ci"):
            self.assertNotIn(forbidden, workflow)


if __name__ == "__main__":
    unittest.main()
