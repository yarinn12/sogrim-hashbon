"""Synthetic controls for the unsigned startup A/B result accounting."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "startup_ab", Path(__file__).with_name("run_startup_ab.py"))
startup_ab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(startup_ab)


class StartupABResultTests(unittest.TestCase):
    def complete_rows(self):
        return [
            {"arm": f"{label}-observer-{'on' if enabled else 'off'}",
             "observerEnabled": enabled, "observerStatus": "passed" if enabled else "disabled",
             "simulatorUdid": f"synthetic-{index}", "freshSimulator": True,
             "testRuns": 1, "testExitCode": 0,
             "collection": {"status": "collected"},
             "documentTiming": {"status": "recorded"}}
            for index, (label, enabled) in enumerate(startup_ab.ARMS)
        ]

    def test_complete_requires_all_four_arms_and_every_diagnostic(self):
        rows = self.complete_rows()
        self.assertTrue(startup_ab.diagnostic_complete(rows))
        for index, replacement in (
            (0, {"testExitCode": 1}),
            (1, {"collection": {"status": "unavailable"}}),
            (2, {"observerStatus": "failed"}),
            (3, {"documentTiming": {"status": "unavailable"}}),
        ):
            with self.subTest(index=index):
                changed = [dict(row) for row in rows]
                changed[index].update(replacement)
                self.assertFalse(startup_ab.diagnostic_complete(changed))
        self.assertFalse(startup_ab.diagnostic_complete(rows[:-1]))
        missing_mode = [dict(row) for row in rows]
        del missing_mode[0]["observerEnabled"]
        self.assertFalse(startup_ab.diagnostic_complete(missing_mode))

    def test_prepare_failure_keeps_identity_without_creating_a_simulator(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = startup_ab.arm_run(
                "3f", False, root, "source", "tree", {"identifier": "runtime", "version": "26"},
                {"identifier": "device", "name": "iPhone"}, "fixture", "fixture-tree",
                root, set(), prepare_error="synthetic source preparation failed")
            persisted = json.loads((root / "3f-observer-off" / "identity.json").read_text())
            self.assertEqual(persisted, record)
            self.assertEqual(record["executionError"], "preparation-failed")
            self.assertIsNone(record["simulatorUdid"])
            self.assertFalse(startup_ab.diagnostic_complete([record]))

    def test_boot_and_build_failures_keep_identity_and_return(self):
        for failed_action in ("boot", "build-for-testing"):
            with self.subTest(failed_action=failed_action), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)

                def fake_logged(command, path, cwd=None, env=None):
                    return 1 if failed_action in command else 0

                with patch.object(startup_ab, "output", return_value="synthetic-udid"), \
                     patch.object(startup_ab, "logged", side_effect=fake_logged):
                    record = startup_ab.arm_run(
                        "4e", False, root, "source", "tree",
                        {"identifier": "runtime", "version": "26"},
                        {"identifier": "device", "name": "iPhone"},
                        "fixture", "fixture-tree", root, set())
                persisted = json.loads((root / "4e-observer-off" / "identity.json").read_text())
                self.assertEqual(persisted, record)
                self.assertEqual(record["executionError"], "RuntimeError")
                self.assertEqual(record["simulatorUdid"], "synthetic-udid")
                self.assertEqual(record["testRuns"], 0)

    def test_matrix_continues_and_persists_summary_after_failed_arm(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            calls = []

            def fake_prepare(app, sha, fixture, out):
                if app.name == "app-3f":
                    raise RuntimeError("synthetic prepare failure")

            def fake_arm(label, enabled, app, sha, tree, runtime, device,
                         fixture_sha, fixture_tree, out, built, prepare_error=None):
                calls.append((label, enabled, prepare_error))
                return {"arm": f"{label}-observer-{'on' if enabled else 'off'}",
                        "observerEnabled": enabled,
                        "executionError": prepare_error or "synthetic boot failure"}

            apps = {label: root / f"app-{label}" for label in startup_ab.SOURCES}
            with patch.object(startup_ab, "prepare_source", side_effect=fake_prepare), \
                 patch.object(startup_ab, "arm_run", side_effect=fake_arm):
                rows = startup_ab.run_matrix(
                    apps, {}, {}, "fixture", "tree", root, {"host": "synthetic"})
            summary = json.loads((root / "summary.json").read_text())
            self.assertEqual(len(calls), 4)
            self.assertEqual(len(rows), 4)
            self.assertTrue(calls[0][2])
            self.assertTrue(calls[3][2])
            self.assertIsNone(calls[1][2])
            self.assertFalse(summary["diagnosticComplete"])
            self.assertFalse(summary["releaseAcceptance"])


if __name__ == "__main__":
    unittest.main()
