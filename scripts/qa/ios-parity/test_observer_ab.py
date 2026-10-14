"""Focused receipt controls for the diagnostic-only iOS observer comparison."""

import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

script = Path(__file__).with_name("observer_ab.py")
spec = importlib.util.spec_from_file_location("observer_ab", script)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf8")


class ObserverABControls(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.baseline = {"appPath": "Debug-iphonesimulator/App.app", "appSha256": "a" * 64,
                         "xctestrunPath": "App.xctestrun", "xctestrunSha256": "b" * 64,
                         "productsSha256": "c" * 64}
        self.plan = {"schemaVersion": 1, "diagnosticOnly": True, "releaseAcceptance": False,
                     "sourceSha": guard.SOURCE_SHA, "sourceTree": guard.SOURCE_TREE,
                     "fixtureSha": guard.SOURCE_SHA, "fixtureTree": guard.SOURCE_TREE,
                     "runnerSha": "d" * 40, "order": ["on", "off"],
                     "runtimeVersion": "26.5", "deviceName": "iPhone 16",
                     "runtimeId": "com.apple.CoreSimulator.SimRuntime.iOS-26-5",
                     "deviceTypeId": "com.apple.CoreSimulator.SimDeviceType.iPhone-16"}
        write_json(self.root / "plan.json", self.plan)
        write_json(self.root / "baseline.json", self.baseline)
        (self.root / "build-invocations.txt").write_text("build-for-testing\n")
        (self.root / "executed-order.txt").write_text("on\noff\n")
        for arm, udid in (("on", "sim-on"), ("off", "sim-off")):
            path = self.root / arm
            write_json(path / "before.json", self.baseline)
            write_json(path / "after.json", self.baseline)
            write_json(path / "simulator.json", {"udid": udid,
                       "runtimeId": self.plan["runtimeId"], "deviceTypeId": self.plan["deviceTypeId"]})
            write_json(path / "shutdown.json", {"udid": udid, "state": "Shutdown"})
            (path / "exit-code.txt").write_text("0\n")
            (path / "parent-exit-code.txt").write_text("0\n")
            (path / "validation.exit-code.txt").write_text("0\n")
            for category in guard.CATEGORIES:
                category_path = path / category
                category_path.mkdir()
                (category_path / "test-started.txt").write_text("test-without-building\n")
                (category_path / "exit-code.txt").write_text("0\n")
                (category_path / "observer-state.txt").write_text(arm + "\n")
                if arm == "on":
                    (category_path / "observer").mkdir()
                    (category_path / "observer/exit-code.txt").write_text("0\n")
                    write_json(category_path / "observer/monitor-report.json",
                               {"udid": udid, "sourceSha": guard.SOURCE_SHA,
                                "sourceTree": guard.SOURCE_TREE, "status": "no-sample"})

    def assert_rejected(self, phrase):
        self.assertIn(phrase, "\n".join(guard.check_run(self.root)))

    def test_one_off_workflow_and_preview_scope(self):
        repo = Path(__file__).resolve().parents[3]
        yaml = (repo / '.github/workflows/ios-home-observer-ab-once.yml').read_text(encoding='utf8')
        for value in ["github.event_name == 'push'", "github.run_number == 1 && github.run_attempt == 1",
                      "github.ref == 'refs/heads/codex/ios-home-observer-ab-20261015'",
                      'runs-on: macos-26', 'timeout-minutes: 35', 'persist-credentials: false']:
            self.assertIn(value, yaml)
        for value in ['workflow_dispatch:', 'pull_request:', 'secrets.', 'continue-on-error:']:
            self.assertNotIn(value, yaml)
        config = guard.read_json(repo / 'vercel.json')
        self.assertIs(config['git']['deploymentEnabled']['codex/ios-home-observer-ab-20261015'], False)

    def test_both_order_permutations_pass(self):
        self.assertEqual(guard.check_run(self.root), [])
        self.plan["order"] = ["off", "on"]
        write_json(self.root / "plan.json", self.plan)
        (self.root / "executed-order.txt").write_text("off\non\n")
        self.assertEqual(guard.check_run(self.root), [])

    def test_first_arm_failure_survives_second_arm_success(self):
        (self.root / "on/exit-code.txt").write_text("65\n")
        self.assert_rejected("on arm failed")
        (self.root / "on/exit-code.txt").write_text("0\n")
        (self.root / "on/default/exit-code.txt").write_text("65\n")
        self.assert_rejected("on/default failed")

    def test_missing_repeated_and_reordered_arm_receipts_fail(self):
        (self.root / "executed-order.txt").write_text("on\non\n")
        self.assert_rejected("missing, repeated or reordered arm execution")
        (self.root / "executed-order.txt").write_text("off\non\n")
        self.assert_rejected("missing, repeated or reordered arm execution")
        (self.root / "executed-order.txt").write_text("on\n")
        self.assert_rejected("missing, repeated or reordered arm execution")

    def test_build_hash_drift_fails_even_if_both_arms_pass(self):
        changed = {**self.baseline, "productsSha256": "e" * 64}
        write_json(self.root / "off/after.json", changed)
        self.assert_rejected("off after.json build hash drift")

    def test_build_and_test_counters_cannot_hide_extra_invocations(self):
        (self.root / "build-invocations.txt").write_text("build-for-testing\nbuild-for-testing\n")
        self.assert_rejected("build counter must be exactly one")
        (self.root / "on/default/test-started.txt").write_text("test-without-building\ntest-without-building\n")
        self.assert_rejected("on/default test counter differs from one")

    def test_off_arm_cannot_run_monitor_and_on_arm_requires_it(self):
        (self.root / "off/default/observer").mkdir()
        self.assert_rejected("off/default off arm ran observer")
        (self.root / "on/default/observer/exit-code.txt").unlink()
        self.assert_rejected("missing on/default observer receipt")

    def test_monitor_failure_is_not_counted_as_observer_on(self):
        report = self.root / "on/default/observer/monitor-report.json"
        write_json(report, {"udid": "sim-on", "sourceSha": guard.SOURCE_SHA,
                            "sourceTree": guard.SOURCE_TREE, "status": "unavailable"})
        self.assert_rejected("on/default observer did not run against the pinned app")

    def test_distinct_shut_down_simulators_and_control_source_are_required(self):
        write_json(self.root / "off/shutdown.json", {"udid": "sim-on", "state": "Booted"})
        self.assert_rejected("off simulator was not shut down")
        self.plan["fixtureSha"] = "e" * 40
        write_json(self.root / "plan.json", self.plan)
        self.assert_rejected("QA fixture drift")

    def test_diagnostic_result_cannot_claim_release_acceptance(self):
        self.plan["releaseAcceptance"] = True
        write_json(self.root / "plan.json", self.plan)
        self.assert_rejected("diagnostic result must not become release acceptance")

    def test_bundle_and_xctestrun_digest_detect_file_change(self):
        products = self.root / "Build/Products"
        app = products / "Debug-iphonesimulator/App.app"
        app.mkdir(parents=True)
        (app / "App").write_bytes(b"first")
        (products / "App.xctestrun").write_bytes(b"test plan")
        first = guard.snapshot(products)
        self.assertEqual(first, guard.snapshot(products))
        (app / "App").write_bytes(b"second")
        second = guard.snapshot(products)
        self.assertNotEqual(first["appSha256"], second["appSha256"])
        self.assertNotEqual(first["productsSha256"], second["productsSha256"])
        (products / "App.xctestrun").write_bytes(b"altered test plan")
        third = guard.snapshot(products)
        self.assertNotEqual(second["xctestrunSha256"], third["xctestrunSha256"])


if __name__ == "__main__":
    unittest.main()
