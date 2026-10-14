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
    cold_session = "11111111-1111-1111-1111-111111111111"
    relaunch_session = "22222222-2222-2222-2222-222222222222"

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
                write_json(category_path / "native-parity.json", {"sourceSha": guard.SOURCE_SHA,
                    "sourceTree": guard.SOURCE_TREE,
                    "records": [{"captureSession": self.cold_session}] * 12 +
                               [{"captureSession": self.relaunch_session}]})
                for session in (self.cold_session, self.relaunch_session):
                    identity = {"event": "web-stage", "session": session,
                                "sourceSha": guard.SOURCE_SHA, "sourceTree": guard.SOURCE_TREE,
                                "fixtureSha": guard.SOURCE_SHA, "fixtureTree": guard.SOURCE_TREE,
                                "deadlineEpochMs": 1792000030000, "timeoutMs": 30000}
                    rows = [{**identity, "stage": "home-wait-start", "probeCount": 0},
                            {**identity, "stage": "home-wait-ready", "probeCount": 3,
                             "homeVisible": True, "homeCount": 1,
                             "homeWidth": 120, "homeHeight": 48}]
                    self.write_startup(arm, category, session, rows)

    def startup_path(self, arm, category, session):
        return self.root / arm / category / f"native-parity-startup-{session}.log"

    def write_startup(self, arm, category, session, rows):
        self.startup_path(arm, category, session).write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf8")

    def startup_rows(self, arm="on", category="default", session=None):
        return [json.loads(line) for line in self.startup_path(
            arm, category, session or self.cold_session).read_text(encoding="utf8").splitlines()]

    def assert_rejected(self, phrase):
        self.assertIn(phrase, "\n".join(guard.check_run(self.root)))

    def test_unconfirmed_host_cleanup_cannot_accept_a_passing_pair(self):
        (self.root / "on/host-diagnostics-unconfirmed.txt").write_text("child closure unknown\n")
        self.assert_rejected("on host diagnostic cleanup is unconfirmed")

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

    def test_missing_home_telemetry_is_not_accepted(self):
        self.startup_path("on", "default", self.cold_session).unlink()
        self.assert_rejected("on/default missing or invalid home wait evidence")

    def test_malformed_or_wrong_session_telemetry_is_rejected(self):
        path = self.startup_path("off", "accessibility-extra-large", self.relaunch_session)
        path.write_text("{malformed\n", encoding="utf8")
        self.assert_rejected("off/accessibility-extra-large missing or invalid home wait evidence")
        rows = self.startup_rows()
        rows[1]["session"] = self.relaunch_session
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait identity")

    def test_duplicate_or_failed_home_wait_is_rejected(self):
        rows = self.startup_rows()
        rows.append({**rows[1], "stage": "home-wait-timeout"})
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default incomplete or failed home wait")
        self.write_startup("on", "default", self.cold_session, rows[:1])
        self.assert_rejected("on/default incomplete or failed home wait")
        self.write_startup("on", "default", self.cold_session, [rows[0], rows[0], rows[1]])
        self.assert_rejected("on/default incomplete or failed home wait")

    def test_wrong_source_fixture_timeout_and_deadline_are_rejected(self):
        rows = self.startup_rows()
        rows[1]["sourceSha"] = "e" * 40
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait identity")
        rows[1]["sourceSha"] = guard.SOURCE_SHA
        rows[1]["fixtureSha"] = "e" * 40
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait identity")
        rows[1]["fixtureSha"] = guard.SOURCE_SHA
        rows[1]["timeoutMs"] = 31000
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait timing fields")
        rows[1]["timeoutMs"] = 30000
        rows[1]["deadlineEpochMs"] += 1
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait timing fields")
        rows[1]["deadlineEpochMs"] = -1
        rows[0]["deadlineEpochMs"] = -1
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait timing fields")

    def test_nonpositive_geometry_and_probe_counts_are_rejected(self):
        rows = self.startup_rows()
        rows[1]["homeWidth"] = -1
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid ready home geometry")
        rows[1]["homeWidth"] = 120
        rows[1]["homeVisible"] = False
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid ready home geometry")
        rows[1]["homeVisible"] = True
        rows[1]["probeCount"] = 0
        self.write_startup("on", "default", self.cold_session, rows)
        self.assert_rejected("on/default invalid home wait timing fields")

    def test_late_ready_timestamp_does_not_add_a_new_deadline_rejection(self):
        rows = self.startup_rows()
        rows[1]["epochMs"] = rows[1]["deadlineEpochMs"] + 1
        self.write_startup("on", "default", self.cold_session, rows)
        self.assertEqual(guard.check_run(self.root), [])

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
