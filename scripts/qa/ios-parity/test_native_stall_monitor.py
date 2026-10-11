"""Behavioral controls for the read-only native simulator stall observer."""

import json
import os
import plistlib
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from native_stall_monitor import (
    Assessment, DarwinProbe, MonitorUnavailable, ProcessIdentity, assess_journal, capture_sample, platform_supported,
    run_observer, verify_target,
)


SHA = "f9b0844a1f7f167d89c9f37fb1c7f1638a5a7965"
TREE = "a436806c1e6b874cb287187ac9b074679910a721"
UDID = "3EA132CE-E345-488E-8964-222A7FCE13F8"
SESSION = "2DF97F4C-CE55-4F2A-9115-0F949B57935F"
BUNDLE = "com.sogrimhashbon.app"
FIXTURE = Path(__file__).with_name("f9-status-gap-excerpt.jsonl")


class NativeStallMonitorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="m-", dir=os.environ.get("IOS_MONITOR_TEST_TMP"))
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.device = self.root / "Devices" / UDID
        self.app = self.device / "data/Containers/Bundle/Application/APP/App.app"
        self.data = self.device / "data/Containers/Data/Application/DATA"
        self.documents = self.data / "Documents"
        self.app.mkdir(parents=True)
        self.documents.mkdir(parents=True)
        (self.app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": BUNDLE, "CFBundleExecutable": "App"}))
        self.executable = self.app / "App"
        self.executable.write_bytes(b"fake Mach-O")
        self.manifest = self.root / "package-manifest.json"
        self.manifest.write_text(json.dumps({"sourceSha": SHA, "sourceTree": TREE}))
        self.process = ProcessIdentity(29725, os.getuid() if hasattr(os, "getuid") else 501,
                                       "Sun Oct 11 04:06:31 2026", str(self.executable), 1791691591)

    def journal(self, text=None, session=SESSION, mtime=1791691609.5):
        path = self.documents / f"native-parity-status-{session}.log"
        path.write_text(text if text is not None else FIXTURE.read_text())
        os.utime(path, (mtime, mtime))
        return path

    def target(self, journal_path, **changes):
        args = dict(udid=UDID, bundle_id=BUNDLE, manifest_path=self.manifest,
                    expected_sha=SHA, expected_tree=TREE,
                    device_rows=[{"udid": UDID, "state": "Booted"}],
                    app_container=self.app, data_container=self.data,
                    process_rows=[self.process], journal_path=journal_path,
                    own_uid=self.process.uid, device_root=self.device)
        args.update(changes)
        return verify_target(**args)

    def test_actual_f9_journal_gap_becomes_sample_eligible(self):
        path = self.journal()
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691618)
        self.assertTrue(result.eligible, result.reason)
        self.assertEqual(result.session, SESSION)
        self.assertEqual(result.phase, "profile-to-keyboard")
        self.assertAlmostEqual(result.gap_seconds, 5.3983769, places=3)
        self.assertEqual(self.target(path), self.process)

    def test_no_sample_before_five_seconds_or_after_keyboard_phase(self):
        self.journal()
        self.assertFalse(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691617).eligible)
        late = json.loads(FIXTURE.read_text().splitlines()[-1])
        late.update(event="captureReceived", phase="keyboard-amount", time=1791691613)
        self.journal(FIXTURE.read_text() + json.dumps(late) + "\n")
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691620)
        self.assertFalse(result.eligible)
        self.assertEqual(result.reason, "phase-ended")

    def test_newest_session_only_and_old_journal_rejected(self):
        self.journal()
        newer = self.journal(json.dumps({"session": "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", "sourceSha": SHA,
                                        "sourceTree": TREE, "event": "requested", "time": 1791691615}) + "\n",
                             session="BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", mtime=1791691615)
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691618)
        self.assertFalse(result.eligible)
        self.assertEqual(result.journal_path, newer)
        newer.unlink()
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691610, 1791691618).reason, "stale-journal")

    def test_tied_newest_sessions_are_ambiguous(self):
        self.journal()
        self.journal(session="BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", mtime=1791691609.5)
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691618).reason,
                         "ambiguous-newest-session")

    def test_source_or_tree_mismatch_rejected(self):
        self.journal()
        self.assertEqual(assess_journal(self.documents, "a" * 40, TREE, 1791691590, 1791691618).reason, "source-mismatch")
        self.assertEqual(assess_journal(self.documents, SHA, "b" * 40, 1791691590, 1791691618).reason, "source-mismatch")

    def test_bom_and_crlf_keep_the_same_source_and_gap(self):
        path = self.journal()
        path.write_bytes(b"\xef\xbb\xbf" + FIXTURE.read_bytes().replace(b"\n", b"\r\n"))
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691618)
        self.assertTrue(result.eligible, result.reason)
        self.assertEqual(result.session, SESSION)

    def test_symlink_journal_rejected(self):
        path = self.journal()
        with patch.object(Path, "is_symlink", autospec=True, side_effect=lambda self: self == path):
            self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691618).reason, "symlink-journal")

    def test_foreign_device_container_bundle_and_pid_rejected(self):
        path = self.journal()
        invalid = [
            {"device_rows": [{"udid": UDID, "state": "Shutdown"}]},
            {"app_container": self.root / "other/App.app"},
            {"data_container": self.root / "other/data"},
            {"bundle_id": "another.app"},
            {"process_rows": [ProcessIdentity(42, self.process.uid, self.process.started, "/other/App")]},
            {"process_rows": [self.process, self.process]},
            {"process_rows": [ProcessIdentity(self.process.pid, self.process.uid + 1, self.process.started,
                                               self.process.command, self.process.start_epoch)]},
        ]
        for change in invalid:
            with self.subTest(change=change), self.assertRaises(MonitorUnavailable):
                self.target(path, **change)

    def test_source_manifest_or_reused_pid_rejected(self):
        path = self.journal()
        self.manifest.write_text(json.dumps({"sourceSha": SHA, "sourceTree": "b" * 40}))
        with self.assertRaises(MonitorUnavailable): self.target(path)
        self.manifest.write_text(json.dumps({"sourceSha": SHA, "sourceTree": TREE}))
        previous = ProcessIdentity(self.process.pid, self.process.uid, "older launch", self.process.command)
        with self.assertRaises(MonitorUnavailable): self.target(path, prior_identity=previous)
        newer_process = ProcessIdentity(self.process.pid, self.process.uid, "Sun Oct 11 04:07:00 2026",
                                        self.process.command, 1791691620)
        with self.assertRaises(MonitorUnavailable):
            self.target(path, process_rows=[newer_process], journal_first_time=1791691608.9966211)

    def test_unsupported_os_is_not_sample_eligible(self):
        self.assertFalse(platform_supported("Windows"))
        self.assertFalse(platform_supported("Linux"))
        self.assertTrue(platform_supported("Darwin"))
        output = self.root / "observer"
        output.mkdir()

        class ForbiddenProbe:
            def containers(self): raise AssertionError("probe must not be called")

        args = SimpleNamespace(output_dir=output, stop_file=output / "stop", source_sha=SHA,
                               source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest)
        result = run_observer(args, probe=ForbiddenProbe(), system_name="Windows")
        self.assertEqual(result["lastReason"], "unsupported-os")
        self.assertEqual(result["samples"], [])
        self.assertEqual(json.loads((output / "monitor-report.json").read_text())["status"], "unavailable")

    def test_darwin_ps_parser_keeps_start_time_and_executable(self):
        row = f"29725 {self.process.uid} Sun Oct 11 04:06:31 2026 {self.executable}"
        with patch.object(DarwinProbe, "command", return_value=row):
            processes = DarwinProbe(UDID, BUNDLE).processes()
        self.assertEqual(len(processes), 1)
        self.assertEqual(processes[0].pid, self.process.pid)
        self.assertEqual(processes[0].command, str(self.executable))
        self.assertGreater(processes[0].start_epoch, 0)

    def test_sample_command_is_bounded_and_rechecks_owned_process(self):
        class Probe:
            def __init__(self, rows): self.rows = rows
            def processes(self): return self.rows

        fake_resource = SimpleNamespace(RUSAGE_CHILDREN=0, RLIMIT_FSIZE=1,
                                        getrusage=lambda _: SimpleNamespace(ru_utime=0, ru_stime=0),
                                        setrlimit=lambda *_: None)
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            Path(args[-1]).write_text("sampled owned app")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.dict(sys.modules, {"resource": fake_resource}), patch("native_stall_monitor.subprocess.run", side_effect=run):
            result = capture_sample(Probe([self.process]), self.process, self.root, 1, 600, 0)
        self.assertEqual(calls[0][:5], ["sample", "29725", "2", "20", "-file"])
        self.assertEqual(result["exit"], 0)
        self.assertEqual(result["bytes"], len("sampled owned app"))
        self.assertEqual(len(result["sha256"]), 64)

        reused = ProcessIdentity(self.process.pid, self.process.uid, "new start", self.process.command, 1791691620)
        with patch.dict(sys.modules, {"resource": fake_resource}), patch("native_stall_monitor.subprocess.run", side_effect=run):
            with self.assertRaises(MonitorUnavailable):
                capture_sample(Probe([reused]), self.process, self.root, 2, 600, 0)
        self.assertEqual(len(calls), 1)

    def test_failed_sample_attempts_still_obey_two_per_phase_cap(self):
        output = self.root / "observer"
        output.mkdir()
        stop = output / "stop"
        args = SimpleNamespace(output_dir=output, stop_file=stop, source_sha=SHA,
                               source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest)

        class Probe:
            def containers(_self): return self.app, self.data
            def devices(_self): return []
            def processes(_self): return []

        clock = SimpleNamespace(now=0.0)

        def sleep(seconds):
            clock.now += seconds
            if clock.now >= 7: stop.touch()

        candidate = Assessment(True, "gap", SESSION, "profile-to-keyboard", 5.4,
                               self.documents / f"native-parity-status-{SESSION}.log", 1791691608)
        with patch("native_stall_monitor.assess_journal", return_value=candidate), \
             patch("native_stall_monitor.verify_target", return_value=self.process), \
             patch("native_stall_monitor.capture_sample", side_effect=MonitorUnavailable("sample-failed")) as sampler, \
             patch("native_stall_monitor.time.monotonic", side_effect=lambda: clock.now), \
             patch("native_stall_monitor.time.sleep", side_effect=sleep), \
             patch("native_stall_monitor.os.getuid", return_value=self.process.uid, create=True):
            report = run_observer(args, probe=Probe(), system_name="Darwin")
        self.assertEqual(sampler.call_count, 2)
        self.assertEqual(report["status"], "unavailable")
        self.assertTrue(any("sample-failed" in message for message in report["errors"]))


if __name__ == "__main__":
    unittest.main()
