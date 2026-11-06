"""Behavioral controls for the read-only native simulator stall observer."""

import json
import hashlib
import os
import plistlib
import sys
import inspect
import subprocess
import native_stall_monitor as monitor
from native_host_preflight import CalibrationError
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
        self.device = self.root / "Library/Developer/CoreSimulator/Devices" / UDID
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
        self.process = ProcessIdentity(29725, os.getuid() if hasattr(os, "getuid") else self.executable.stat().st_uid,
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

    def startup_journal(self, ready=False, last_time=1791691621.0, phase="starting", ended=False):
        rows = [
            {"event": "viewDidAppear", "time": 1791691600.0},
            {"event": "timerScheduled", "time": 1791691600.1},
            {"event": "decoded", "phase": phase, "nativeStatusReady": False, "time": 1791691602.0},
            {"event": "decoded", "phase": phase, "nativeStatusReady": False, "time": last_time},
        ]
        if ready:
            rows.append({"event": "decoded", "phase": "home", "nativeStatusReady": True, "time": 1791691622.0})
        if ended:
            rows.append({"event": "captureReceived", "phase": "keyboard-amount", "time": 1791691622.0})
        return self.journal("".join(json.dumps(dict(row, session=SESSION, sourceSha=SHA, sourceTree=TREE)) + "\n"
                                    for row in rows), mtime=1791691622.0)

    def test_continuous_startup_not_ready_is_sample_eligible_before_xctest_timeout(self):
        path = self.startup_journal()
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691623)
        self.assertTrue(result.eligible, result.reason)
        self.assertEqual(result.phase, "startup-not-ready")
        self.assertEqual(result.journal_path, path)
        self.assertEqual(result.elapsed_seconds, 23)
        self.assertEqual(result.gap_seconds, 0)
        self.assertEqual(self.target(path, journal_first_time=result.first_time), self.process)
        self.startup_journal(last_time=1791691618.0)
        early = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691619)
        self.assertFalse(early.eligible)
        self.assertEqual(early.reason, "startup-under-threshold")

    def test_ready_or_foreign_startup_is_not_sample_eligible(self):
        self.startup_journal(ready=True)
        self.assertFalse(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691624).eligible)
        self.assertEqual(assess_journal(self.documents, "a" * 40, TREE, 1791691590, 1791691624).reason,
                         "source-mismatch")
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691601, 1791691624).reason,
                         "stale-or-invalid-time")
        self.startup_journal(ended=True)
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691624).reason,
                         "phase-ended")

    def test_missing_only_decoded_phase_is_eligible_after_twenty_seconds(self):
        self.startup_journal(phase="missing")
        result = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691623)
        self.assertTrue(result.eligible, result.reason)
        self.assertEqual(result.phase, "startup-not-ready")
        self.startup_journal(phase="missing", last_time=1791691618.0)
        early = assess_journal(self.documents, SHA, TREE, 1791691590, 1791691619)
        self.assertFalse(early.eligible)
        self.assertEqual(early.reason, "startup-under-threshold")

    def test_startup_without_view_appearance_or_after_home_capture_is_not_sampled(self):
        path = self.startup_journal(phase="missing")
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        path.write_text("".join(json.dumps(row) + "\n" for row in rows if row["event"] != "viewDidAppear"))
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691623).reason,
                         "before-profile")
        rows.append(dict(rows[-1], event="captureReceived", phase="home", time=1791691622.0))
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        self.assertEqual(assess_journal(self.documents, SHA, TREE, 1791691590, 1791691623).reason,
                         "before-profile")

    def test_pid_identity_errors_distinguish_zero_and_multiple_matches_without_raw_paths(self):
        path = self.journal()
        for rows, count in (([], 0), ([self.process, self.process], 2)):
            with self.subTest(count=count):
                with self.assertRaises(MonitorUnavailable) as caught:
                    self.target(path, process_rows=rows)
                details = getattr(caught.exception, "details", {})
                self.assertEqual(details.get("candidateCount"), count)
                self.assertEqual(details["parserFailures"], 0)
                self.assertEqual(details["commandLength"], max((len(row.command) for row in rows), default=0))
                self.assertEqual(details["pathDigest"], hashlib.sha256(str(self.executable).encode()).hexdigest())
                self.assertNotIn(str(self.executable), json.dumps(details))

    def test_pid_parser_metadata_is_preserved_in_identity_diagnostics(self):
        path = self.journal()
        with self.assertRaises(MonitorUnavailable) as caught:
            self.target(path, process_rows=[], process_scan={"parserFailures": 2, "commandLength": 500})
        self.assertEqual(caught.exception.details["parserFailures"], 2)
        self.assertEqual(caught.exception.details["commandLength"], 500)

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
        source = self.root / "line-ending-source.jsonl"
        content = FIXTURE.read_text(encoding="utf-8-sig").encode("utf8")
        for newline in (b"\n", b"\r\n"):
            with self.subTest(source_newline=newline):
                source.write_bytes(content.replace(b"\n", newline))
                # Universal newlines avoid CRCRLF when a Windows checkout
                # already contains CRLF. The generated journal is real CRLF.
                text = source.read_text(encoding="utf-8-sig")
                path.write_bytes(b"\xef\xbb\xbf" + text.replace("\n", "\r\n").encode("utf8"))
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
        probe = DarwinProbe(UDID, BUNDLE)
        with patch.object(DarwinProbe, "command", return_value=row + "\nmalformed process row"):
            processes = probe.processes()
        self.assertEqual(len(processes), 1)
        self.assertEqual(processes[0].pid, self.process.pid)
        self.assertEqual(processes[0].command, str(self.executable))
        self.assertGreater(processes[0].start_epoch, 0)
        self.assertEqual(probe.last_process_scan,
                         {"parserFailures": 1, "commandLength": len(str(self.executable))})

    def test_rejected_startup_pid_records_bounded_structured_diagnostic_without_sampling(self):
        candidate = Assessment(True, "startup-not-ready", SESSION, "startup-not-ready", 0,
                               self.documents / f"native-parity-status-{SESSION}.log", 1791691600, 23)
        class Probe:
            def containers(_self): return self.app, self.data
            def devices(_self): return [{"udid": UDID, "state": "Booted"}]
            def processes(_self): return []

        for count in (0, 2):
            with self.subTest(candidate_count=count):
                output = self.root / f"observer-{count}"
                output.mkdir()
                stop = output / "stop"
                args = SimpleNamespace(output_dir=output, stop_file=stop, source_sha=SHA,
                                       source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest)
                clock = SimpleNamespace(now=0.0)
                def sleep(seconds):
                    clock.now += seconds
                    if clock.now >= 3: stop.touch()
                details = {"candidateCount": count, "parserFailures": 2, "commandLength": 500,
                           "pathDigest": hashlib.sha256(str(self.executable).encode()).hexdigest()}
                with patch("native_stall_monitor.assess_journal", return_value=candidate), \
                     patch("native_stall_monitor.verify_target",
                           side_effect=MonitorUnavailable("app-pid-not-unique", details)), \
                     patch("native_stall_monitor.capture_sample") as sampler, \
                     patch("native_stall_monitor.time.monotonic", side_effect=lambda: clock.now), \
                     patch("native_stall_monitor.time.sleep", side_effect=sleep), \
                     patch("native_stall_monitor.os.getuid", return_value=self.process.uid, create=True):
                    report = run_observer(args, probe=Probe(), system_name="Darwin")
                sampler.assert_not_called()
                self.assertEqual(report["status"], "unavailable")
                self.assertEqual(report["containerState"], "stable")
                self.assertEqual(len(report["diagnostics"]), 1)
                self.assertEqual(report["diagnostics"][0]["candidateCount"], count)
                self.assertEqual(report["diagnostics"][0]["parserFailures"], 2)
                self.assertEqual(report["diagnostics"][0]["commandLength"], 500)
                self.assertEqual(report["diagnostics"][0]["pathDigest"], details["pathDigest"])
                self.assertEqual(json.loads((output / "monitor-report.json").read_text())["diagnostics"],
                                 report["diagnostics"])

    def test_container_lookup_failure_is_recorded_once_without_sampling(self):
        output = self.root / "observer-no-container"
        output.mkdir()
        stop = output / "stop"
        args = SimpleNamespace(output_dir=output, stop_file=stop, source_sha=SHA,
                               source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest)
        class Probe:
            def containers(_self): raise MonitorUnavailable("simctl-timeout")
        clock = SimpleNamespace(now=0.0)
        def sleep(seconds):
            clock.now += seconds
            if clock.now >= 3: stop.touch()
        with patch("native_stall_monitor.time.monotonic", side_effect=lambda: clock.now), \
             patch("native_stall_monitor.time.sleep", side_effect=sleep), \
             patch("native_stall_monitor.capture_sample") as sampler:
            report = run_observer(args, probe=Probe(), system_name="Darwin")
        sampler.assert_not_called()
        self.assertEqual(report["containerState"], "unresolved")
        self.assertEqual(report["diagnostics"],
                         [{"reason": "container-unavailable", "containerState": "lookup-failed"}])

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

    def test_owned_startup_candidate_samples_at_most_twice(self):
        output = self.root / "observer-startup-sample"
        output.mkdir()
        stop = output / "stop"
        args = SimpleNamespace(output_dir=output, stop_file=stop, source_sha=SHA,
                               source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest)
        class Probe:
            def containers(_self): return self.app, self.data
            def devices(_self): return [{"udid": UDID, "state": "Booted"}]
            def processes(_self): return [self.process]
        clock = SimpleNamespace(now=0.0)
        def sleep(seconds):
            clock.now += seconds
            if clock.now >= 7: stop.touch()
        candidate = Assessment(True, "startup-not-ready", SESSION, "startup-not-ready", 0,
                               self.documents / f"native-parity-status-{SESSION}.log", 1791691600, 23)
        with patch("native_stall_monitor.assess_journal", return_value=candidate), \
             patch("native_stall_monitor.verify_target", return_value=self.process) as verifier, \
             patch("native_stall_monitor.capture_sample", return_value={"exit": 0}) as sampler, \
             patch("native_stall_monitor.time.monotonic", side_effect=lambda: clock.now), \
             patch("native_stall_monitor.time.sleep", side_effect=sleep), \
             patch("native_stall_monitor.os.getuid", return_value=self.process.uid, create=True):
            report = run_observer(args, probe=Probe(), system_name="Darwin")
        self.assertEqual(verifier.call_count, 2)
        self.assertEqual(sampler.call_count, 2)
        self.assertEqual(report["status"], "sampled")
        self.assertEqual([sample["phase"] for sample in report["samples"]],
                         ["startup-not-ready", "startup-not-ready"])
        self.assertEqual([sample["elapsedSeconds"] for sample in report["samples"]], [23, 23])


class HostIdentityMonitorTests(unittest.TestCase):
    """Synthetic host files; actual macOS CLI/format validation is separate."""
    def setUp(self):
        NativeStallMonitorTests.setUp(self)
        env = patch.dict(os.environ, {"GITHUB_RUN_ID":"123", "GITHUB_RUN_ATTEMPT":"1", "GITHUB_JOB":"native-parity"})
        env.start(); self.addCleanup(env.stop)
        host = patch("native_stall_monitor.host_identity", return_value="a"*64, create=True)
        host.start(); self.addCleanup(host.stop)
    journal = NativeStallMonitorTests.journal
    startup_journal = NativeStallMonitorTests.startup_journal
    def host_fixture(self):
        (self.device / "device.plist").write_bytes(plistlib.dumps({"UDID": UDID, "state": 3}))
        self.startup_journal()
        self.startup = self.documents / f"native-parity-startup-{SESSION}.log"
        self.startup_rows = [dict(event="capacitorDidLoad-enter", sequence=1, processId=self.process.pid,
                                  session=SESSION, sourceSha=SHA, sourceTree=TREE, time=1791691599.0)]
        self.write_startup()
        stat = (self.device / "device.plist").stat()
        self.calibration = dict(verified=True,context=dict(sourceSha=SHA,sourceTree=TREE,udid=UDID,
            hostIdentity="a"*64,runId="123",runAttempt="1",job="native-parity"),
            localDevice=dict(udid=UDID,observedState=3,inode=stat.st_ino,device=stat.st_dev,uid=self.process.uid))
        return assess_journal(self.documents, SHA, TREE, 1791691590, 1791691623)

    def write_startup(self):
        self.startup.write_text("".join(json.dumps(row) + "\n" for row in self.startup_rows))
        os.utime(self.startup, (1791691622, 1791691622))

    def host_target(self, assessment=None, **changes):
        args = dict(assessment=assessment or self.host_fixture(), app_container=self.app, data_container=self.data,
                    udid=UDID, bundle_id=BUNDLE, manifest_path=self.manifest, expected_sha=SHA, expected_tree=TREE,
                    process_rows=[self.process], own_uid=self.process.uid, device_root=self.device,
                    run_started=1791691590, now=1791691623, calibration=self.calibration)
        args.update(changes)
        # Allows the explicit OLD V2 control to exercise behavior, not an import error.
        if "calibration" not in inspect.signature(monitor.verify_local_target).parameters:
            args.pop("calibration",None)
        return monitor.verify_local_target(**args)

    def test_host_identity_requires_all_independent_local_evidence(self):
        self.assertEqual(self.host_target(), self.process)

    def test_foreign_and_ambiguous_host_processes_are_rejected(self):
        candidate = self.host_fixture()
        foreign = ProcessIdentity(42, self.process.uid, self.process.started, "/foreign/App", self.process.start_epoch)
        wrong_uid = ProcessIdentity(self.process.pid, self.process.uid + 1, self.process.started,
                                    self.process.command, self.process.start_epoch)
        reused = ProcessIdentity(self.process.pid, self.process.uid, "new launch", self.process.command, 1791691620)
        for rows in ([], [foreign], [self.process, self.process], [wrong_uid], [reused]):
            with self.subTest(rows=rows), self.assertRaises(MonitorUnavailable):
                self.host_target(candidate, process_rows=rows)

    def test_missing_or_foreign_local_device_state_is_rejected(self):
        candidate = self.host_fixture()
        path = self.device / "device.plist"
        for device in ({"UDID": "0" * 36, "state": 3}, {"UDID": UDID, "state": 2},
                       {"UDID": UDID, "state": "3"}, {"UDID": UDID, "state": True}, {}):
            path.write_bytes(plistlib.dumps(device))
            with self.subTest(device=device), self.assertRaises(MonitorUnavailable): self.host_target(candidate)
        path.unlink()
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_wrong_device_file_owner_and_symlink_are_rejected(self):
        candidate = self.host_fixture()
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate, own_uid=self.process.uid + 1)
        path = self.device / "device.plist"
        with patch.object(Path, "is_symlink", autospec=True, side_effect=lambda p: p == path):
            with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_foreign_cached_bundle_data_or_manifest_is_rejected(self):
        candidate = self.host_fixture()
        for changes in ({"app_container": self.root / "foreign/App.app"},
                        {"data_container": self.root / "foreign/data"}, {"bundle_id": "another.app"},
                        {"device_root": self.root / "another-device"}, {"expected_tree": "b" * 40}):
            with self.subTest(changes=changes), self.assertRaises(MonitorUnavailable): self.host_target(candidate, **changes)
        self.manifest.write_text(json.dumps({"sourceSha": "a" * 40, "sourceTree": TREE}))
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_journal_pid_is_evidence_not_an_authorized_sample_argument(self):
        candidate = self.host_fixture()
        for pid in (42, True, "29725", 0):
            self.startup_rows[0]["processId"] = pid
            self.write_startup()
            with self.subTest(pid=pid), self.assertRaises(MonitorUnavailable): self.host_target(candidate)
        self.startup_rows[0]["processId"] = self.process.pid
        self.startup_rows.append(dict(self.startup_rows[0], processId=self.process.pid + 1))
        self.write_startup()
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_startup_source_session_and_time_are_bound_to_current_phase(self):
        for change in ({"sourceSha": "a" * 40}, {"sourceTree": "b" * 40},
                       {"event": "web-stage"}, {"sequence": 2},
                       {"session": "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB"},
                       {"time": 1791691580}, {"time": 1791691630}):
            candidate = self.host_fixture()
            self.startup_rows[0].update(change)
            self.write_startup()
            with self.subTest(change=change), self.assertRaises(MonitorUnavailable): self.host_target(candidate)
        candidate = self.host_fixture()
        os.utime(self.startup, (1791691580, 1791691580))
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_missing_partial_and_symlink_startup_are_rejected(self):
        candidate = self.host_fixture()
        self.startup.write_text('{"processId":29725')
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)
        self.write_startup()
        with patch.object(Path, "is_symlink", autospec=True, side_effect=lambda p: p == self.startup):
            with self.assertRaises(MonitorUnavailable): self.host_target(candidate)
        self.startup.unlink()
        with self.assertRaises(MonitorUnavailable): self.host_target(candidate)

    def test_phase_ending_between_detection_and_host_proof_stops_sampling(self):
        candidate = self.host_fixture()
        self.startup_journal(ended=True)
        with self.assertRaisesRegex(MonitorUnavailable, "host-phase-or-session-changed"):
            self.host_target(candidate)

    def observe_with_hung_revalidation(self, process_rows=None, hang=True, calibrated=True):
        self.host_fixture()
        output = self.root / "host-proof-observer"
        output.mkdir(exist_ok=True)
        stop = output / "stop"
        args = SimpleNamespace(output_dir=output, stop_file=stop, source_sha=SHA,
                               source_tree=TREE, udid=UDID, bundle_id=BUNDLE, manifest=self.manifest,
                               calibration=self.root / "calibration.json", ownership=self.root / "owner.json")
        clock = SimpleNamespace(now=0.0, wall_calls=0)
        def wall_time():
            clock.wall_calls += 1
            return 1791691590 if clock.wall_calls == 1 else 1791691623
        def sleep(seconds):
            clock.now += seconds
            if clock.now >= 7: stop.touch()
        owner = self
        class Probe:
            calls = 0
            device_calls = 0
            def containers(_self):
                _self.calls += 1
                if _self.calls == 1 or not hang: return owner.app, owner.data
                # Simulates the original revalidation RPC consuming its unchanged
                # eight-second budget. No subprocess or real sleep is performed.
                clock.now += 8
                raise subprocess.TimeoutExpired(["xcrun", "simctl", "get_app_container"], 8)
            def devices(_self):
                _self.device_calls += 1
                return [{"udid": UDID, "state": "Booted"}]
            def processes(_self): return [owner.process] if process_rows is None else process_rows
        probe = Probe()
        with patch("native_stall_monitor.time.monotonic", side_effect=lambda: clock.now), \
             patch("native_stall_monitor.time.time", side_effect=wall_time), \
             patch("native_stall_monitor.time.sleep", side_effect=sleep), \
             patch("native_stall_monitor.os.getuid", return_value=self.process.uid, create=True), \
             patch.object(Path, "home", return_value=self.root), \
             patch("native_stall_monitor.load_calibration", return_value=self.calibration,
                   side_effect=None if calibrated else CalibrationError("unverified-preflight")) as loader, \
             patch("native_stall_monitor.capture_sample", return_value={"exit": 0}) as sampler:
            report = run_observer(args, probe=probe, system_name="Darwin")
        return report, sampler, probe

    def test_hung_container_revalidation_still_collects_owned_diagnostics(self):
        report, sampler, probe = self.observe_with_hung_revalidation()
        self.assertEqual(sampler.call_count, 2, report)
        self.assertEqual(probe.calls, 1)
        self.assertEqual(probe.device_calls, 0)
        self.assertEqual(report["containerState"], "host-verified")
        self.assertEqual(report["status"], "sampled")
        self.assertEqual([call.args[1] for call in sampler.call_args_list], [self.process, self.process])
        self.assertTrue(all(row["result"] == "verified" and row["pid"] == self.process.pid
                            and row["wallSeconds"] >= 0 for row in report["identityChecks"]))
        self.assertTrue(all(row["phase"] == "startup-not-ready" for row in report["samples"]))

    def test_hung_container_does_not_allow_foreign_or_ambiguous_process_sample(self):
        for rows in ([], [self.process, self.process]):
            with self.subTest(count=len(rows)):
                report, sampler, probe = self.observe_with_hung_revalidation(rows)
                sampler.assert_not_called()
                self.assertEqual(probe.calls, 1)
                self.assertEqual(report["status"], "unavailable")
                self.assertTrue(all(row["result"] == "rejected" for row in report["identityChecks"]))
                for path in (self.root / "host-proof-observer").iterdir(): path.unlink()

    def test_missing_calibration_cannot_authorize_local_state_three(self):
        candidate=self.host_fixture()
        with self.assertRaises(MonitorUnavailable):self.host_target(candidate,calibration=None)

    def test_failed_preflight_keeps_original_live_verification(self):
        report,sampler,probe=self.observe_with_hung_revalidation(hang=False,calibrated=False)
        self.assertEqual(sampler.call_count,2)
        self.assertEqual(probe.calls,3)
        self.assertEqual(probe.device_calls,2)
        self.assertFalse(report["hostCalibration"]["verified"])
        self.assertTrue(report["hostCalibration"]["legacyVerificationRequired"])
        self.assertTrue(all(row["method"]=="legacy-live-simctl-proof" for row in report["identityChecks"]))

    def test_failed_preflight_and_hung_legacy_verifier_never_sample(self):
        report,sampler,probe=self.observe_with_hung_revalidation(hang=True,calibrated=False)
        sampler.assert_not_called()
        self.assertEqual(probe.calls,2)
        self.assertEqual(report["containerState"],"lookup-failed")
        self.assertTrue(report["hostCalibration"]["legacyVerificationRequired"])

    def test_foreign_calibration_context_never_authorizes_host_identity(self):
        candidate=self.host_fixture()
        for field,value in (("runId","999"),("runAttempt","2"),("job","other-job"),
                            ("hostIdentity","b"*64),("sourceSha","a"*40),("sourceTree","b"*40),
                            ("udid","00000000-0000-0000-0000-000000000000")):
            receipt=dict(self.calibration,context=dict(self.calibration["context"],**{field:value}))
            with self.subTest(field=field),self.assertRaises(MonitorUnavailable):
                self.host_target(candidate,calibration=receipt)


if __name__ == "__main__":
    unittest.main()
